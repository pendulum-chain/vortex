// Greetings for the signed-in screens. A Privy e-mail login has no first name, so the name is
// optional ("Olá." / "Boas-vindas."), never a placeholder word in its place.

const firstNameOf = (name) => String(name || "").trim().split(/\s+/)[0] || "";

/** "Olá, Ana." / "Olá." */
export const helloPt = (firstName) => (firstNameOf(firstName) ? `Olá, ${firstNameOf(firstName)}.` : "Olá.");

/** "Boas-vindas, Ana." / "Boas-vindas." (gender-neutral, instead of "Bem-vindo(a)") */
export const welcomeTitlePt = (firstName) => (firstNameOf(firstName) ? `Boas-vindas, ${firstNameOf(firstName)}.` : "Boas-vindas.");
