const { sendSuccess, sendError, send, convertToAsync, errorToObject, ErrorWithCode } = require("./utils");
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
                const hex = new Date().getTime().toString(16).padEnd(16, crypto.randomBytes(6).toString("hex"));
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
            exec.resultState = error ? "ERROR" : "SUCCESS";
            exec.result = stringifyResult(res);
            exec.id = execID;
            exec.error = error ? errorToObject(error) : null;

            log.info(`Finished cronjob ${id} | ${exec.resultState}`);
            
            delete executionStore[id + execID];
            runningStore[id]= false;
            
            const dj = await loadJob(id);
            dj.nextExecutionTime = cronJobsMap[id].nextDate().valueOf();
            if (!Array.isArray(dj.history)) {
                dj.history = [exec];
            } else {
                dj.history.push(exec);
            }
            await saveJob(dj);

        }

        function stringifyResult(res) {
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
            getCronjob(req.params.id)
                .then(dj => send(rep, dj))
                .catch(e => sendError(rep, e.code || 500, e.message));
        });

        async function getCronjob(id) {
            return loadJob(id).then(populateRunning);
        }

        instance.get(opts.prefix + CRON_PATH + "/list", (req, rep) => {
            getCronjobList()
                .then(list => send(rep, list))
                .catch(e => sendError(rep, e.code || 500, e.message));
        });

        async function getCronjobList() {
            return persistentStore.list()
                .then(list => list.map(j => { const o = JSON.parse(j); delete o.history; return populateRunning(o); }),
                    e => { throw new ErrorWithCode(`Error while fetching cronjobs: ${e.message}`, 500); });
        }

        instance.post(opts.prefix + CRON_PATH + "/run/:id", (req, rep) => {
            runCronjob(req.params.id)
                .then(() => sendSuccess(rep, "OK"))
                .catch(e => sendError(rep, e.code || 500, e.message));
        });

        async function runCronjob(id) {
            const cj = cronJobsMap[id];
            return getCronjob(id)
                .then(j => {
                    if (j.active) {
                        cj.fireOnTick();
                    } else {
                        throw new ErrorWithCode(`Cronjob ${id} is disabled.`, 400);
                    }
                });
        }

        instance.post(opts.prefix + CRON_PATH + "/enable/:id", (req, rep) => {
            enableCronjob(req.params.id).then(() => sendSuccess(rep, "OK")).catch(e => sendError(rep, e.code || 500, e.message));
        });

        instance.post(opts.prefix + CRON_PATH + "/disable/:id", (req, rep) => {
            disableCronjob(req.params.id).then(() => sendSuccess(rep, "OK")).catch(e => sendError(rep, e.code || 500, e.message));
        });

        async function enableCronjob(id) {
            return toggleCronjob(id, true);
        }

        async function disableCronjob(id) {
            return toggleCronjob(id, false);
        }

        async function toggleCronjob(id, active) {
            const cj = cronJobsMap[id];
            return modifyCronjob(id, j => {
                j.active = active;
                j.active ? cj.start() : cj.stop();
            });
        }

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
            scheduleJob(req.params.id, req.body.schedule)
                .then(() => sendSuccess(rep, "OK"))
                .catch(e => sendError(rep, e.code || 500, e.message));
        });

        async function scheduleJob(id, schedule) {
            return modifyCronjob(id, j => {
                const oldSchedule = j.schedule;
                j.schedule = schedule;
                try {
                    createCronJob(j);
                } catch (error) {
                    log.error(error.message);
                    j.schedule = oldSchedule;
                    throw new ErrorWithCode(`${schedule} is not a valid cron expression.`, 400);
                }
            })
        }

        instance.decorate("getCronjob", getCronjob);
        instance.decorate("getCronjobList", getCronjobList);
        instance.decorate("runCronjob", runCronjob);
        instance.decorate("enableCronjob", enableCronjob);
        instance.decorate("disableCronjob", disableCronjob);
        instance.decorate("scheduleJob", scheduleJob);

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
            const errorc = new ErrorWithCode(`Cronjob ${id} not found.`, 404);
            try {
                const dj = await persistentStore.get(id);
                if (!dj) {
                    throw errorc;
                }
                /*if (!cronJobsMap[id]) {
                    throw errorc;
                }*/
                return JSON.parse(dj);
            } catch (error) {
                log.error(error.message);
                throw errorc;
            }
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