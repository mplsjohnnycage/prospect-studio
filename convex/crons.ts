import {cronJobs} from "convex/server";
import {internal} from "./_generated/api";

const crons=cronJobs();
// Pick up prospect replies to sent outreach. Exits immediately when nothing has been sent.
crons.interval("poll prospect replies",{minutes:5},internal.sales.pollReplies,{});
// Draft follow-ups for unanswered first emails each morning (Central time). Never sends.
crons.daily("draft follow-ups",{hourUTC:13,minuteUTC:7},internal.followups.planDue,{});
// Agent loop: plans and drains tasks. Exits immediately while the kill switch is on (default).
crons.interval("agent tick",{minutes:15},internal.agent.tick,{});
crons.daily("agent daily digest",{hourUTC:12,minuteUTC:30},internal.agent.dailyDigest,{});
crons.weekly("agent weekly learn",{dayOfWeek:"monday",hourUTC:13,minuteUTC:0},internal.agent.weeklyLearn,{});
export default crons;
