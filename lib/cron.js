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
        })();
        if (!persistentStore) {
            throw new Error("store or storePath is required");
        }
        const tmpGet = persistentStore.get, tmpSet = persistentStore.set, tmpList = persistentStore.list;
        persistentStore.get = convertToAsync(tmpGet);
        persistentStore.set = convertToAsync(tmpSet);
        persistentStore.list = convertToAsync(tmpList);

        const jobsObject = {};
        jobs.forEach(job => {
            if (!job.id) {
                throw new Error("Cron job id is missing");
            }
            if (!job.schedule) {
                throw new Error("Cron job schedule is missing");
            }
            const asyncTask = convertToAsync(job.task);
            job.task = () => {
                const random = crypto.randomBytes(12).toString("hex")
                before(job.id, random)
                    .then(start => {
                        start && asyncTask()
                            .then(r => after(job.id, random, r), e => after(job.id, random, null, e))
                            .catch(console.log)
                    });
            }
            jobsObject[job.id] = job;
        });
        const jobIDs = jobs.map(j => j.id);
        jobs.splice(0, jobs.length);

        const promises = Object.values(jobsObject)
            .map(async j => {
                let job = null;
                try {
                    job = await persistentStore.get(j.id);
                    job.state = "IDLE";
                    //job.schedule = j.schedule;
                } catch (error) {
                    job = {
                        id: j.id,
                        schedule: j.schedule,
                        nextExecutionTime: 0,
                        active: false,
                        state: "IDLE",
                        executions: []
                    }
                }
                await persistentStore.set(job.id, job);
                return job;
            });

        const dbJobs = await Promise.all(promises);

        const cronjobs = dbJobs.map(job => {
            const cj = new CronJob({
                cronTime: job.schedule,
                onTick: jobsObject[job.id].task
            });
            if (job.active || true) {
                cj.start();
            }
            return cj;
        });
        const tmpStore = {}
        async function before(id, execID) {
            const dj = await persistentStore.get(id);
            if (dj.state === "RUNNING") {
                return false;
            }
            dj.state = "RUNNING";
            await persistentStore.set(id, dj);
            tmpStore[id + execID] = {
                start: new Date().getTime(),
            };
            return true;
        }
        async function after(id, execID, res, error) {
            const now = new Date().getTime();
            const exec = tmpStore[id + execID];
            exec.end = now;
            exec.duration = exec.end - exec.start;
            exec.result = error ? "ERROR" : "SUCCESS";
            exec.result2 = String(res || null);
            exec.id = execID;
            exec.error = error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : null;

            const dj = await persistentStore.get(id);
            dj.state = "IDLE";
            if (!Array.isArray(dj.executions)) {
                dj.executions = [exec];
            } else {
                dj.executions.push(exec);
            }
            await persistentStore.set(id, dj);

            delete tmpStore[id+ execID];
        }

        instance.get(opts.prefix + CRON_PATH, (req, rep) => {

        });

        instance.post(opts.prefix + CRON_PATH + "/start", (req, rep) => {

        });

        instance.post(opts.prefix + CRON_PATH + "/enable", (req, rep) => {

        });

        instance.post(opts.prefix + CRON_PATH + "/disable", (req, rep) => {

        });
    }
}