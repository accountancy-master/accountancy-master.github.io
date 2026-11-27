// Kept apart from theme.ts, which is client code: the root layout (a server component) puts this script in the head.

/** Where the device keeps the learner's choice of colour theme: 'light' or 'dark'; nothing means the system's. */
export const THEME_KEY = 'am.theme';

/** Run in the head of every page: sets the stored choice on <html>. Plain text, since it runs before any script loads. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
