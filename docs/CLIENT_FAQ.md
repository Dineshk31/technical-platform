# Client FAQ — Centurion Technical Assessment Platform

*Answers here are based on the actual implementation audited in `docs/PRODUCT_GUIDE.md`. Anything not yet built is explicitly labeled "Future enhancement" — it is never presented as if it already works.*

---

**Q: Can multiple students use the platform at the same time?**
Yes. Each student's attempt is a separate database row, isolated from every other student's. The code execution service processes submissions one at a time (by design, to keep resource use predictable), so during a burst of activity — e.g. many students clicking Submit near the deadline — later submissions will simply queue for a moment rather than fail or crash. For a normal class-sized cohort this is not noticeable; it would need attention before running something much larger (see "How scalable is it?" below).

**Q: How are assessments secured against unauthorized access?**
Every request is checked twice server-side, not just hidden in the interface: first, is this a valid logged-in session (JWT); second, does this user's role and identity actually permit this action. A student can only ever see assessments they've been explicitly assigned to, and only ever their own attempts/results/submissions — enforced by ownership checks in the database queries themselves, not just by what the UI shows them.

**Q: Can students cheat?**
The platform prevents the specific things it's designed to prevent: it never sends hidden test cases, reference solutions, or MCQ correct answers to a student's browser at any point (verified at three independent code layers for coding questions); the exam timer is computed and enforced by the server, so a student can't extend their own time by tampering with their local clock; and results are withheld from everyone until the whole class's exam window has closed, so an early finisher can't tip off classmates still testing.

What it does **not** currently do: detect tab-switching, browser dev-tools use, screen sharing, plagiarism/code-similarity across submissions, or use a webcam/proctoring service. These are all *Future enhancement* — none of them exist in the codebase today.

**Q: How does the timer work?**
When a student starts an assessment, the server calculates and stores the exact end time as the earlier of (their start time + the assessment's duration) or the assessment's own overall end time — so nobody can get more time than the exam window allows even by starting late. The countdown shown in the browser is just a display of that server value; the frontend never invents its own remaining-time number. Two independent server-side checks back this up: every action (running code, saving an answer, submitting) is rejected if the server's clock says time is up, and a background check running every 30 seconds automatically closes out any attempt that's expired even if nobody is actively using it (e.g. the tab was closed).

**Q: Can we add more programming languages?**
The system currently supports C++, Java, and Python. Adding a new language means adding a new "runner" module in the execution service (a compile/run command for that language) and adding the language to a shared enum used by both the API and the frontend — a moderate, well-contained engineering task, but not something an admin can do from the UI today. It is not a one-click configuration change.

**Q: How does AI generation work, exactly?**
An admin picks a topic, difficulty, target language, and how many questions to generate (capped at 10 per request). The server builds a prompt and asks Google's Gemini model for a strict, structured JSON response matching the platform's own question format. Nothing is saved automatically — the admin previews every generated question (including its test cases and reference solution) and chooses which ones, if any, to keep.

**Q: Are AI-generated questions automatically trusted or published?**
No. Every AI-generated question is independently re-validated by the server against the same rules a hand-written question must pass, and — regardless of that — it always starts in a "Pending Review" state, identical to a manually created question. It cannot be attached to any exam until an admin explicitly approves it. There is no "auto-approve AI content" path anywhere in the code.

**Q: Can administrators edit AI-generated questions?**
Yes, exactly the same way they'd edit a manually written one — same form, same fields, same rules, including full visibility into the hidden test cases and reference solution before deciding to approve, reject, or send it back for another look.

**Q: Can this integrate with the university's existing student/login systems (SSO)?**
Not today. The database has a placeholder field on user accounts (`externalId`) clearly intended for a future single-sign-on integration, and the authentication code is structured behind an abstraction that's meant to make adding SSO easier later — but no actual SSO provider is implemented right now. Logging in only works via the platform's own email/password accounts. *Future enhancement.*

**Q: Is it deployable today?**
Yes, in the sense that all the pieces run and work — the audit in `docs/PRODUCT_GUIDE.md` §11 verified the full flow end-to-end. Whether it's *appropriate* to deploy depends on the audience: it's ready for a demo or a small trusted pilot group. It is not yet hardened enough (see the security/execution notes in the Product Guide) for unsupervised use by real students at scale in a graded, high-stakes setting — most notably, the code-execution component doesn't run inside a security sandbox yet.

**Q: How scalable is it?**
The API and database layer are built in a fairly standard, scalable way (stateless API, a real relational database, indexed queries). The two specific things that would need attention before scaling up significantly: (1) the code-execution service currently processes one submission at a time — the architecture supports adding more worker processes later without rewriting anything, but that isn't configured today; (2) the login rate-limiter keeps its counters in server memory, so it wouldn't behave correctly if you ran more than one copy of the API behind a load balancer without changing it to a shared store first.

**Q: Is there a leaderboard or class ranking?**
The server actually computes a rank for every finished result (highest score first, earliest submission as a tiebreaker) and stores it — but there is currently no page or API response that shows it to anyone. It exists in the database, not in the product. *Showing it is a future enhancement*, not a bug fix — the plumbing to compute it is already there.

**Q: What happens if the AI provider (Gemini) is down or not configured?**
The platform keeps working normally for everything except that one feature. If no API key is set at all, the "Generate with AI" action returns a clear "not configured" message instead of crashing anything. If Gemini itself times out or errors, the system retries automatically a couple of times before showing the admin a clean error — never a raw technical error message.

**Q: Can a student see another student's questions, code, or results?**
No — every query for an attempt, a submission, or a result is scoped to the requesting user's own identity in addition to their role, both for students and, in the admin-facing views, filtered to the specific assessment being looked at.

**Q: What happens if a student's internet drops mid-exam?**
Their code is auto-saved to the server roughly every 1.5 seconds while they type (and force-saved on tab close), so reconnecting and reopening the attempt resumes exactly where they left off — the timer keeps running server-side the whole time, since it was never paused by the disconnect in the first place.
