// The five arms, as capabilities rather than names.
//
// Pages ask what a participant HAS -- a chatbot, the multimodal tabs, a chance to
// customise -- instead of matching a list of condition ids. The arms were listed
// by name in half a dozen places before, and that is exactly how `no_ai` ended up
// with no chatbot when every arm was supposed to have one.
//
//   multimodal  the video / podcast / infographic tabs sit beside the chatbot
//   chat        'cimo' = the CIMO coach prompt, 'default' = the plain assistant
//   customize   may regenerate the multimodal content once per modality
//
// Every arm has a chatbot. Assignment is 20% each; see login.html.
window.STUDY_CONDITIONS = {
    mm_cimo_custom: { multimodal: true,  chat: 'cimo',    customize: true  },
    mm_cimo:        { multimodal: true,  chat: 'cimo',    customize: false },
    mm_chat_custom: { multimodal: true,  chat: 'default', customize: true  },
    mm_chat:        { multimodal: true,  chat: 'default', customize: false },
    chat_only:      { multimodal: false, chat: 'default', customize: false }
};

window.STUDY_CONDITION_IDS = Object.keys(window.STUDY_CONDITIONS);

// Unknown ids (an old session, a hand-typed URL) fall back to the plainest arm
// that still works, rather than to a participant staring at a missing panel.
window.conditionCaps = function (condition) {
    return window.STUDY_CONDITIONS[condition] || window.STUDY_CONDITIONS.chat_only;
};
