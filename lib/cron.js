const { getJSONBody, sendSuccess, sendError, send, convertToAsync } = require("./utils");
const { CRON_PATH } = require("./constants.json");
const { CronJob } = require("cron");
const fs = require("fs-extra");
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

        const jobsMap = {};
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
            jobsMap[job.id] = job;
        });
        jobs.splice(0, jobs.length);

        // load job from store
        const promises = Object.values(jobsMap)
            .map(async j => {
                let job = null;
                try {
                    job = await persistentStore.get(j.id);
                } catch (error) {
                    job = {
                        id: j.id,
                        schedule: j.schedule,
                        nextExecutionTime: 0,
                        active: false,
                        executions: []
                    }
                }
                const cj = new CronJob({
                    cronTime: job.schedule,
                    onTick: j.task
                });
                if (job.active) {
                    cj.start();
                }
                job.nextExecutionTime = cj.nextDate().valueOf();
                cronJobsMap[job.id] = cj;
                await persistentStore.set(job.id, job);
                return job;
            });


        await Promise.all(promises);

        function before(id, execID) {
            if (runningStore[id]) {
                return false;
            }
            runningStore[id] = true;
            executionStore[id + execID] = {
                start: new Date().getTime(),
            };
            log.debug(`Started cronjob ${id}`);
            return true;
        }

        async function after(id, execID, res, error) {
            const now = new Date().getTime();
            const exec = executionStore[id + execID];
            exec.end = now;
            exec.duration = exec.end - exec.start;
            exec.result = error ? "ERROR" : "SUCCESS";
            exec.result2 = res == null ? null : String(res);
            exec.id = execID;
            exec.error = error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : null;

            log.debug(`Finished cronjob ${id}`);

            const dj = await persistentStore.get(id);
            dj.nextExecutionTime = cronJobsMap[id].nextDate().valueOf();
            if (!Array.isArray(dj.executions)) {
                dj.executions = [exec];
            } else {
                dj.executions.push(exec);
            }
            await persistentStore.set(id, dj);

            delete executionStore[id + execID];
            delete runningStore[id];
        }

        instance.get(opts.prefix + CRON_PATH + "/job/:id", (req, rep) => {
            persistentStore.get(req.params.id)
                .then(dj => send(rep, dj))
                .catch(e => sendError(rep, 400, `Cronjob ${req.params.id} not found.`));
        });

        instance.get(opts.prefix + CRON_PATH + "/list", (req, rep) => {
            persistentStore.list()
                .then(list => send(rep, list))
                .catch(e => sendError(rep, 500, "Error while fetching cronjobs."));
        });

        instance.post(opts.prefix + CRON_PATH + "/run/:id", (req, rep) => {
            const cj = cronJobsMap[req.params.id];
            if (cj) {
                persistentStore.get(req.params.id)
                    .then(dj => {
                        if (dj.active) {
                            cj.fireOnTick();
                            sendSuccess(rep, "OK");
                        } else {
                            sendError(rep, 400, `Cronjob ${req.params.id} is disabled.`)
                        }
                    }, e => sendError(rep, 400, `Cronjob ${req.params.id} not found.`));
            } else {
                sendError(rep, 400, `Cronjob ${req.params.id} not found.`);
            }
        });

        instance.post(opts.prefix + CRON_PATH + "/enable/:id", (req, rep) => {
            const cj = cronJobsMap[req.params.id];
            if (cj) {
                modifyCronjob(req.params.id, dj => { dj.active = true; cj.start(); })
                    .then(() => sendSuccess(rep, "OK"))
                    .catch(e => sendError(rep, 500, `Could not enable cronjob ${req.params.id}.`));
            } else {
                sendError(rep, 400, `Cronjob ${req.params.id} not found.`);
            }
        });

        instance.post(opts.prefix + CRON_PATH + "/disable/:id", (req, rep) => {
            const cj = cronJobsMap[req.params.id];
            if (cj) {
                modifyCronjob(req.params.id, dj => { dj.active = false; cj.stop(); })
                    .then(() => sendSuccess(rep, "OK"))
                    .catch(e => sendError(rep, 500, `Could not disable cronjob ${req.params.id}.`));
            } else {
                sendError(rep, 400, `Cronjob ${req.params.id} not found.`);
            }
        });

        async function modifyCronjob(id, callback) {
            const dj = await persistentStore.get(id);
            callback(dj);
            await persistentStore.set(id, dj);
        }

    }
}

async function createFileStore(p) {
    await fs.mkdirs(p);
    return {
        async get(id) {
            return await fs.readJSON(path.join(p, `${id}.json`));
        },
        async set(id, job) {
            await fs.outputJSON(path.join(p, `${id}.json`), job);
        },
        async list() {
            return await Promise.all((await fs.readdir(p)).map(async file => await fs.readJSON(path.join(p, file))))
        }
    }
}