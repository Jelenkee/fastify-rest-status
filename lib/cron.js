const { sendSuccess, sendError, send, convertToAsync, errorToObject } = require("./utils");
const { CRON_PATH } = require("./constants.json");
const { CronJob } = require("cron");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

module.exports = async function (log, instance, opts) {
    if (opts.cron) {
        const jobs = (opts.cron.jobs || []).slice();
        if (!jobs.length) {
            log.warn("Missing cronjobs");
            return;
        }
        const persistentStore = opts.cron.store || await (async () => {
            const p = opts.cron.storePath;
            if (!p) {
                return null;
            } else {
                return createFileStore(p);
            }
        })();
        if (!persistentStore) {
            throw new Error("store or storePath is required");
        }
        const tmpGet = persistentStore.get, tmpSet = persistentStore.set, tmpList = persistentStore.list;
        persistentStore.get = convertToAsync(tmpGet);
        persistentStore.set = convertToAsync(tmpSet);
        persistentStore.list = convertToAsync(tmpList);

        const cronJobsMap = {};
        const runningStore = {};
        const executionStore = {};

        jobs.forEach(job => {
            if (!job.id) {
                throw new Error("Cron job id is missing");
            }
            if (!job.schedule) {
                throw new Error("Cron job schedule is missing");
            }
            const asyncTask = convertToAsync(job.task);
            job.task = () => {
                const hex = new Date().getTime().toString(16).padStart(16, crypto.randomBytes(6).toString("hex"));
                const start = before(job.id, hex);
                start && asyncTask()
                    .then(r => after(job.id, hex, r), e => after(job.id, hex, null, e))
                    .catch(e => log.error(e.stack));
            }
        });

        // load job from store
        const promises = jobs
            .map(async j => {
                let job = null;
                try {
                    job = (await loadJob(j.id)) || initJob();
                } catch (error) {
                    job = initJob();
                }
                createCronJob(job, j.task);
                await saveJob(job);
                return job;

                function initJob() {
                    return {
                        id: j.id,
                        schedule: j.schedule,
                        nextExecutionTime: 0,
                        running: null,
                        active: false,
                        history: []
                    };
                }
            });
        jobs.splice(0, jobs.length);

        function createCronJob(job, func) {
            const oldJob = cronJobsMap[job.id];
            const newJob = new CronJob({
                cronTime: job.schedule,
                onTick: func || oldJob._callbacks[0]
            });
            if (job.active) {
                newJob.start();
            }
            if (oldJob) {
                oldJob.stop();
            }
            cronJobsMap[job.id] = newJob;
            job.nextExecutionTime = newJob.nextDate().valueOf();
            return newJob;
        }

        await Promise.all(promises);

        function before(id, execID) {
            if (runningStore[id]) {
                return false;
            }
            runningStore[id] = true;
            executionStore[id + execID] = {
                start: new Date().getTime(),
            };
            log.info(`Started cronjob ${id}`);
            return true;
        }

        async function after(id, execID, res, error) {
            const now = new Date().getTime();
            const exec = executionStore[id + execID];
            exec.end = now;
            exec.duration = exec.end - exec.start;
            exec.result = error ? "ERROR" : "SUCCESS";
            exec.result2 = stringifyResult(res);
            exec.id = execID;
            exec.error = error ? errorToObject(error) : null;

            log.info(`Finished cronjob ${id}`);

            const dj = await loadJob(id);
            dj.nextExecutionTime = cronJobsMap[id].nextDate().valueOf();
            if (!Array.isArray(dj.history)) {
                dj.history = [exec];
            } else {
                dj.history.push(exec);
            }
            await saveJob(dj);

            delete executionStore[id + execID];
            delete runningStore[id];
        }

        function stringifyResult(res) {
            if (res == null) {
                return null;
            }
            if (typeof res === "object") {
                try {
                    return JSON.stringify(res);
                } catch (error) {
                    return String(res);
                }
            } else {
                return String(res);
            }
        }

        instance.get(opts.prefix + CRON_PATH + "/job/:id", (req, rep) => {
            loadJob(req.params.id)
                .then(dj => send(rep, populateRunning(dj)))
                .catch(e => sendError(rep, 404, `Cronjob ${req.params.id} not found.`));
        });

        instance.get(opts.prefix + CRON_PATH + "/list", (req, rep) => {
            persistentStore.list()
                .then(list => send(rep, list.map(j => { const o = JSON.parse(j); delete o.history; return populateRunning(o); })))
                .catch(e => sendError(rep, 500, "Error while fetching cronjobs."));
        });

        instance.post(opts.prefix + CRON_PATH + "/run/:id", (req, rep) => {
            const cj = cronJobsMap[req.params.id];
            if (cj) {
                loadJob(req.params.id)
                    .then(dj => {
                        if (dj.active) {
                            cj.fireOnTick();
                            sendSuccess(rep, "OK");
                        } else {
                            sendError(rep, 400, `Cronjob ${req.params.id} is disabled.`)
                        }
                    }, e => sendError(rep, 404, `Cronjob ${req.params.id} not found.`));
            } else {
                sendError(rep, 404, `Cronjob ${req.params.id} not found.`);
            }
        });

        instance.post(opts.prefix + CRON_PATH + "/enable/:id", (req, rep) => {
            const cj = cronJobsMap[req.params.id];
            if (cj) {
                modifyCronjob(req.params.id, dj => { dj.active = true; cj.start(); })
                    .then(() => sendSuccess(rep, "OK"))
                    .catch(e => sendError(rep, 500, `Could not enable cronjob ${req.params.id}.`));
            } else {
                sendError(rep, 404, `Cronjob ${req.params.id} not found.`);
            }
        });

        instance.post(opts.prefix + CRON_PATH + "/disable/:id", (req, rep) => {
            const cj = cronJobsMap[req.params.id];
            if (cj) {
                modifyCronjob(req.params.id, dj => { dj.active = false; cj.stop(); })
                    .then(() => sendSuccess(rep, "OK"))
                    .catch(e => sendError(rep, 500, `Could not disable cronjob ${req.params.id}.`));
            } else {
                sendError(rep, 404, `Cronjob ${req.params.id} not found.`);
            }
        });

        instance.post(opts.prefix + CRON_PATH + "/schedule/:id", {
            schema: {
                body: {
                    type: "object",
                    properties: {
                        schedule: {
                            type: "string",
                            minLength: 9
                        }
                    },
                    required: ["schedule"]
                }
            }
        }, (req, rep) => {
            const schedule = req.body.schedule;
            if (!schedule) {
                return sendError(rep, 400, "Missing value");
            }
            const cj = cronJobsMap[req.params.id];
            let sent = false;
            if (cj) {
                modifyCronjob(req.params.id, dj => {
                    const oldSchedule = dj.schedule;
                    dj.schedule = schedule;
                    try {
                        createCronJob(dj);
                    } catch (error) {
                        dj.schedule = oldSchedule;
                        sendError(rep, 400, `${schedule} is not a valid cron expression.`);
                        sent = true;
                    }
                }).then(() => !sent && sendSuccess(rep, "OK"))
                    .catch(e => !sent && sendError(rep, 500, `Could not schedule cronjob ${req.params.id} with schedule ${schedule}.`));
            } else {
                sendError(rep, 404, `Cronjob ${req.params.id} not found.`);
            }
        });

        function populateRunning(job) {
            job.running = Boolean(runningStore[job.id]);
            return job;
        }

        async function modifyCronjob(id, callback) {
            const dj = await loadJob(id);
            callback(dj);
            await saveJob(dj);
        }

        async function loadJob(id) {
            const dj = await persistentStore.get(id);
            return JSON.parse(dj || null);
        }

        async function saveJob(job) {
            await persistentStore.set(job.id, JSON.stringify(job));
        }

    }
}

async function createFileStore(p) {
    await fs.mkdir(p, { recursive: true });
    return {
        async get(id) {
            return (await fs.readFile(path.join(p, `${id}.json`))).toString();
        },
        async set(id, job) {
            await fs.writeFile(path.join(p, `${id}.json`), job);
        },
        async list() {
            return await Promise.all((await fs.readdir(p)).map(async file => (await fs.readFile(path.join(p, file))).toString()))
        }
    }
}