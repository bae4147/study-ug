// Keeps the browser Back button from leaving the page. Used after reading ends
// (post-task, survey, complete): the participant must not return to an earlier step.
// Every Back press lands on the entry we pushed here, and we push it again.
(function () {
  history.pushState(null, '', location.href);
  window.addEventListener('popstate', function () {
    history.pushState(null, '', location.href);
  });
})();
