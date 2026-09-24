// Where a participant belongs, given the sessions already on their account.
// Shared by index.html (which routes) and login.html (which decides whether a
// session may be created at all), so the two cannot drift apart.
window.STUDY_FLOW = (function () {
    // A session stores the phase it is *about to* do, so resuming is just
    // "open that page again". 'complete' is deliberately absent: a finished
    // session is not somewhere to return to.
    var PHASE_PAGE = {
        consent: 'consent.html',
        instructions: 'instructions.html',
        survey: 'survey.html',
        post_task: 'post-task.html',
        quiz: 'quiz.html',
        survey2: 'survey2.html'
    };

    // Exempt from the one-run-per-person rule, so the study can still be walked
    // through end to end after it is live.
    var TEST_ACCOUNTS = ['sh.bae@snu.ac.kr', 'shyun.bae@gmail.com', 'bae.332@osu.edu'];

    function isTestAccount(email) {
        var e = String(email || '').trim().toLowerCase();
        return TEST_ACCOUNTS.indexOf(e) !== -1 || /^tester-[^@]*@example\.com$/.test(e);
    }

    // Participants have a handful of sessions at most, so read them all rather
    // than querying: the newest session may be an abandoned one while an older
    // one is the finished run that has to block a second attempt.
    function readSessions(db, uid) {
        return db.collection('users').doc(uid).collection('sessions').get()
            .then(function (snap) {
                var finished = null, open = null, openAt = -1;
                snap.forEach(function (doc) {
                    var d = doc.data() || {};
                    if (d.currentPhase === 'complete') {
                        finished = { id: doc.id, data: d };
                        return;
                    }
                    if (!PHASE_PAGE[d.currentPhase]) return;
                    var at = d.startedAt && d.startedAt.toMillis ? d.startedAt.toMillis() : 0;
                    if (at >= openAt) { openAt = at; open = { id: doc.id, data: d }; }
                });
                return { finished: finished, open: open };
            });
    }

    function urlFor(uid, session) {
        var page = PHASE_PAGE[session.data.currentPhase];
        if (!page) return null;
        var params = new URLSearchParams({
            participantId: uid,
            experimentId: session.id,
            sessionId: session.id,
            condition: session.data.condition || '',
            paper: session.data.paper || 'hafner2014',
            mode: 'experiment'
        });
        return page + '?' + params.toString();
    }

    function remember(sessionId) {
        try { sessionStorage.setItem('currentSessionId', sessionId); } catch (e) {}
    }

    return {
        PHASE_PAGE: PHASE_PAGE,
        isTestAccount: isTestAccount,
        readSessions: readSessions,
        urlFor: urlFor,
        remember: remember
    };
})();
