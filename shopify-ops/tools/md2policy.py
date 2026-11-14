"""Convert a policy draft (limited Markdown) into the HTML body Shopify policies take.

Supports: ## / ### headings, paragraphs, - lists, 1. lists, | tables |, --- rules, [text](url) links.
Drops the top-level # title (Shopify shows its own policy title) and <!-- comments -->.
Refuses to convert a file that still has [[...]] blanks.
Usage: python3 md2policy.py in.md out.html
"""
import html, re, sys

def inline(text):
    out, pos = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)\s]+)\)", text):
        out.append(html.escape(text[pos:m.start()], quote=False))
        out.append(f'<a href="{html.escape(m.group(2))}">{html.escape(m.group(1), quote=False)}</a>')
        pos = m.end()
    out.append(html.escape(text[pos:], quote=False))
    return "".join(out)

def convert(md):
    if "[[" in md:
        sys.exit("refusing: unfilled [[...]] blanks remain")
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    lines, out, i = md.splitlines(), [], 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line or line.startswith("# "):
            i += 1
        elif line.startswith("### "):
            out.append(f"<h3>{inline(line[4:])}</h3>"); i += 1
        elif line.startswith("## "):
            out.append(f"<h2>{inline(line[3:])}</h2>"); i += 1
        elif line == "---":
            out.append("<hr>"); i += 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            head, body = rows[0], rows[1:]
            t = ["<table>", "<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>", "<tbody>"]
            t += ["<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body]
            out.append("\n".join(t + ["</tbody>", "</table>"]))
        elif re.match(r"- ", line) or re.match(r"\d+\. ", line):
            ordered = bool(re.match(r"\d+\. ", line))
            pat = r"\d+\. " if ordered else r"- "
            items = []
            while i < len(lines) and re.match(pat, lines[i]):
                items.append(re.sub("^" + pat, "", lines[i].rstrip())); i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#|- |\d+\. |\||---$)", lines[i]):
                para.append(lines[i].strip()); i += 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(out) + "\n"

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    open(dst, "w", encoding="utf-8").write(convert(open(src, encoding="utf-8").read()))
