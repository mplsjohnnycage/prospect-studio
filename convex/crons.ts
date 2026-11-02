import {cronJobs} from "convex/server";
import {internal} from "./_generated/api";

const crons=cronJobs();
// Pick up prospect replies to sent outreach. Exits immediately when nothing has been sent.
crons.interval("poll prospect replies",{minutes:5},internal.sales.pollReplies,{});
export default crons;
