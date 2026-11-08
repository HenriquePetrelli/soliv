import { Fragment, ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEGAL_PAGES } from "@/lib/legal";
import { cleanLegalMarkdown } from "@/components/legal/cleanLegalMarkdown";

// Renderiza os documentos de docs/lgpd. Cobre só o Markdown que eles usam
// (títulos, parágrafos, listas, tabelas, citações, negrito e links) e monta
// elementos React, sem injetar HTML.

// Links entre os arquivos (./politica-de-privacidade.md) viram rotas do app.
const LINK_TARGETS: Record<string, string> = {
  "./politica-de-privacidade.md": LEGAL_PAGES.privacy_policy.path,
  "./termos-de-uso-paciente.md": LEGAL_PAGES.terms_patient.path,
  "./termos-de-uso-psicologo.md": LEGAL_PAGES.terms_psychologist.path,
};


const renderInline = (text: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${i++}`;
    if (match[1] !== undefined) {
      nodes.push(<strong key={key}>{renderInline(match[1], key)}</strong>);
    } else {
      const href = match[3];
      const internal = LINK_TARGETS[href];
      nodes.push(
        internal ? (
          <Link key={key} to={internal} className="text-primary underline">
            {match[2]}
          </Link>
        ) : /^https?:\/\//.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-primary underline">
            {match[2]}
          </a>
        ) : (
          <Fragment key={key}>{match[2]}</Fragment>
        ),
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
};

interface ListItem {
  text: string;
  children: ListItem[];
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

const LegalMarkdown = ({ markdown }: { markdown: string }) => {
  const lines = cleanLegalMarkdown(markdown).split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], key);
      blocks.push(
        level === 1 ? (
          <h1 key={key} className="text-2xl font-semibold text-foreground">{content}</h1>
        ) : level === 2 ? (
          <h2 key={key} className="text-lg font-semibold text-foreground pt-4">{content}</h2>
        ) : (
          <h3 key={key} className="text-base font-semibold text-foreground pt-2">{content}</h3>
        ),
      );
      i++;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      blocks.push(<hr key={key} className="border-border" />);
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key} className="border-l-4 border-primary/40 pl-4 text-muted-foreground">
          {renderInline(quote.join(" "), key)}
        </blockquote>,
      );
      continue;
    }

    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!/^\|?[\s:|-]+\|?$/.test(lines[i].trim())) rows.push(splitRow(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c} className="text-left font-semibold border-b border-border p-2 align-top">
                    {renderInline(cell, `${key}h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-border p-2 align-top">
                      {renderInline(cell, `${key}r${r}c${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMarker = /^(\s*)(?:[-*]|\d+\.)\s+(.*)$/;
    if (listMarker.test(line)) {
      const ordered = /^\d+\./.test(line.trim());
      const items: ListItem[] = [];
      while (i < lines.length && listMarker.test(lines[i])) {
        const [, indent, text] = lines[i].match(listMarker)!;
        if (indent.length >= 2 && items.length > 0) {
          items[items.length - 1].children.push({ text, children: [] });
        } else {
          items.push({ text, children: [] });
        }
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={key} className={`${ordered ? "list-decimal" : "list-disc"} pl-6 space-y-1`}>
          {items.map((item, n) => (
            <li key={n}>
              {renderInline(item.text, `${key}i${n}`)}
              {item.children.length > 0 && (
                <ul className="list-[circle] pl-6 space-y-1 mt-1">
                  {item.children.map((child, m) => (
                    <li key={m}>{renderInline(child.text, `${key}i${n}c${m}`)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const paragraph: string[] = [lines[i].trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3}\s|>|\s*\||\s*(?:[-*]|\d+\.)\s|-{3,}$)/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={key} className="leading-relaxed">
        {renderInline(paragraph.join(" "), key)}
      </p>,
    );
  }

  return <div className="space-y-3 text-sm text-foreground">{blocks}</div>;
};

export default LegalMarkdown;
