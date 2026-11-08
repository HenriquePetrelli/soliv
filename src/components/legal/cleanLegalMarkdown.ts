// Tira o aviso interno de revisão e as marcações ⚖️ para o advogado.
export const cleanLegalMarkdown = (markdown: string): string =>
  markdown
    .split("\n")
    .filter((line) => !/^>\s*\*\*Versão para revisão/.test(line))
    .join("\n")
    .replace(/\s*\*\*⚖️\*\*/g, "")
    .replace(/\s*⚖️/g, "");
