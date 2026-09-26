#!/usr/bin/env python3
"""Step 2 of 2: turn the positioned lines into the text the generators read.

    python3 scripts/paper/build-text.py <lines.json> functions/paper-hafner2014.txt docs/papers/hafner2014/paper.txt

One text, two copies, written in the same run so they cannot drift apart:
  - functions/  for the media generators (the Cloud Functions cannot see docs/);
  - docs/       for the chatbot, which the browser fetches. This one also carries
    page markers, "[Page 3 of 14 | printed p. 83]", where each page begins,
    because readers ask about specific pages and may mean the viewer's page
    (1-14) or the journal page printed on it (81-94). The generators do not get
    them: a podcast that says "on page 83" would be pointing at nothing.

What goes, and why:
  - running heads ("82  A. Häfner et al.", "Time management training  83"), the
    journal/DOI line, copyright and affiliation block -- noise the model would
    otherwise try to make sense of;
  - the reference list and author bios -- a quarter of the text, and a source of
    names and years the model can mistake for findings.
What changes:
  - words split across lines are rejoined (only "Stewart-Brown" and
    "time-related" keep their hyphen: those are real);
  - lines become paragraphs again, using the 11pt first-line indent;
  - the six tables, which flat extraction scatters through the prose, are
    rebuilt as tables and set down where they belong: 1-2 after "Sample and
    procedure", 3-6 at the end of Results. Their numbers are read from the PDF
    rows, not retyped.
Nothing else in the body is altered, including the paper's own typos.
"""
import json, re, sys

LEFT, INDENT = 47, 58
HEADINGS = {
    'Method': '##', 'Results': '##', 'Discussion': '##',
    'Design': '###', 'Time management training': '###', 'Sample and procedure': '###',
    'Measures': '###',
    'Time management behaviour': '####', 'Perceived stress (tension)': '####',
    'Perceived control of time': '####', 'Demands': '####',
}
KEEP_HYPHEN = {'Stewart', 'time'}

L = json.load(open(sys.argv[1]))
texts = [l['text'] for l in L]

def idx(s, start=0, exact=True):
    for i in range(start, len(L)):
        if (texts[i] == s) if exact else texts[i].startswith(s):
            return i
    raise SystemExit(f'not found: {s!r}')

nums = lambda s: re.findall(r'[−-]?\d+\.\d+|\d+', s.replace('−', '-'))

# ---- tables: find each block, read its rows, rebuild ------------------------
def block(start, end_prefix):
    a = idx(start, exact=False); b = idx(end_prefix, a, exact=False)
    return a, b

t1 = block('Table 1 Semester of trainees', '12 \t 1 \t 4.3')
t2 = block('Table 2 Experience concerning', 'Quite a lot experience')
t3 = block('Table 3 Zero-order correlations', '*p<0.05; **p<0.01 (two-tailed)')
t4 = block('Table 4 Means and standard deviations', 'Demands \t 3.59')
t5 = block('Table 5 Multivariate analysis', '*p<0.05; **p<0.01')
t6 = block('Table 6 Means and standard deviations', 'Demands \t 3.68')
# Table 4's caption runs onto a second line, as do Table 6's
table_lines = set()
for a, b in (t1, t2, t3, t4, t5, t6):
    table_lines.update(range(a, b + 1))

def md(caption, header, rows, note=None):
    out = [f'**{caption}**', '', '| ' + ' | '.join(header) + ' |',
           '|' + '---|' * len(header)]
    out += ['| ' + ' | '.join(r) + ' |' for r in rows]
    if note: out += ['', note]
    return '\n'.join(out)

rows1 = [texts[i].split(' \t ') for i in range(t1[0] + 2, t1[1] + 1)]
T1 = md('Table 1. Semester of trainees (n = 23)@@P1@@', ['Semester', 'Number', 'Percentage'], rows1)

rows2 = [texts[i].split(' \t ') for i in range(t2[0] + 3, t2[1] + 1)]
T2 = md('Table 2. Experience concerning time management before training (n = 23)@@P2@@',
        ['Self-rating', 'Number', 'Percentage'], rows2)

rows3 = []
for i in range(t3[0] + 2, t3[1]):
    parts = texts[i].split(' \t ')
    rows3.append(parts + [''] * (5 - len(parts)))
T3 = md('Table 3. Zero-order correlations and Cronbach’s alpha coefficients (in parentheses) at time 1 (n = 48)@@P3@@',
        ['Variable', '1', '2', '3', '4'], rows3, '*p < 0.05; **p < 0.01 (two-tailed)')

rows4 = []
for i in range(t4[0] + 4, t4[1] + 1):
    parts = texts[i].split(' \t ')
    rows4.append([parts[0]] + parts[1:])
T4 = md('Table 4. Means (M) and standard deviations (SD) at the three measurement points (n = 23). '
        'Time 1 = directly before training, Time 2 = 2 weeks after, Time 3 = 4 weeks after@@P4@@',
        ['Variable', 'Time 1 M', 'Time 1 SD', 'Time 2 M', 'Time 2 SD', 'Time 3 M', 'Time 3 SD'], rows4)

rows5 = []
for i in range(t5[0] + 3, t5[1]):
    parts = texts[i].split(' \t ')
    if len(parts) == 1:
        label = {'Pretest-posttest 1': 'Pretest vs. posttest 1 (2 weeks)',
                 'Pretest-posttest 2': 'Pretest vs. posttest 2 (4 weeks)'}.get(parts[0], parts[0])
        rows5.append([f'*{label}*', '', '', '', ''])
    else:
        rows5.append(parts)
T5 = md('Table 5. Multivariate analysis of variance for repeated measurement@@P5@@',
        ['Variable', 'df', 'F', 'Partial η²', 'p value'], rows5, '*p < 0.05; **p < 0.01')

# Table 6 rows are split over two lines for the long variable names; the twelve
# numbers per variable are read in order: T1 no/little M SD, T1 moderate M SD,
# then the same for T2 and T3.
seg = ' '.join(texts[i] for i in range(t6[0], t6[1] + 1))
rows6 = []
for name, pat in [('Time management behaviour', r'Time management\s+([\d.\s\t]+?)\s*behaviour'),
                  ('Perceived control of time', r'Perceived control\s+([\d.\s\t]+?)\s*of time'),
                  ('Stress (tension)', r'Stress \(tension\)\s*\t?\s*([\d.\s\t]+)'),
                  ('Demands', r'Demands\s*\t?\s*([\d.\s\t]+)$')]:
    vals = nums(re.search(pat, seg).group(1))[:12]
    assert len(vals) == 12, (name, vals)
    rows6.append([name] + vals)
hdr6 = ['Variable']
for tp in ('T1', 'T2', 'T3'):
    for grp in ('no/little', 'moderate/some'):
        hdr6 += [f'{tp} {grp} M', f'{tp} {grp} SD']
T6 = md('Table 6. Means (M) and standard deviations (SD) by prior time-management experience '
        '(no or little experience: n = 14; moderate or some experience: n = 9). '
        'T1 = before training, T2 = 2 weeks after, T3 = 4 weeks after@@P6@@', hdr6, rows6)

# ---- body -------------------------------------------------------------------
start = idx('Abstract', exact=False)
end = idx('References')
skip = set(table_lines)
for i, l in enumerate(L):
    if l['top'] < 60:                                     # running heads, journal line
        skip.add(i)
for s_ in ('A. Häfner (*)', 'Adolf-Würth-Center', 'D-97070', 'e-mail:'):
    for i in range(start, end):
        if texts[i].startswith(s_): skip.add(i)

NPAGES = max(l['page'] for l in L)
PRINTED_OFFSET = 80                                        # PDF page 1 is printed page 81
def marker(pg):
    return f'[Page {pg} of {NPAGES} | printed p. {pg + PRINTED_OFFSET}]'
TABLE_PAGE = {n: L[b[0]]['page'] for n, b in enumerate((t1, t2, t3, t4, t5, t6), start=1)}

def build(pages):
    tables = [T1, T2, T3, T4, T5, T6]
    for n in range(1, 7):
        where = f' ({marker(TABLE_PAGE[n])[1:-1]})' if pages else ''
        tables[n - 1] = tables[n - 1].replace(f'@@P{n}@@', where)
    t1_, t2_, t3_, t4_, t5_, t6_ = tables

    # A paragraph normally indents only its first line. The one block quotation
    # in the paper (Frese et al. 2003) indents every line, so consecutive indented
    # lines continue the paragraph unless the previous one ended a sentence; a
    # paragraph made only of indented lines is set as a quotation, so the model
    # can tell another author's words from the authors' own.
    paras, cur = [], ['']
    shape = {'lines': 0, 'all_indented': True}
    def flush():
        if cur[0].strip():
            text_ = cur[0].strip()
            if shape['lines'] >= 2 and shape['all_indented']:
                text_ = '> ' + text_
            paras.append(text_)
        cur[0] = ''
        shape['lines'] = 0; shape['all_indented'] = True
    def add(line):
        c = cur[0]
        if c.endswith('-'):
            m = re.search(r'([A-Za-z]+)-$', c)
            if m and m.group(1) not in KEEP_HYPHEN and line[:1].islower():
                cur[0] = c[:-1] + line; return
            cur[0] = c + line; return
        cur[0] = (c + ' ' + line) if c else line

    head = ['# Decreasing students’ stress through time management training: an intervention study',
            '',
            'Alexander Häfner, Armin Stock & Verena Oberst. Eur J Psychol Educ (2015) 30:81–94. '
            'DOI 10.1007/s10212-014-0229-2. Published online 6 September 2014.']
    if pages:
        head += ['', f'Page markers such as {marker(3)} show where each page of the PDF begins: '
                     f'"Page N of {NPAGES}" is the page number in the PDF viewer, and "printed p." is the '
                     f'journal page number printed on that page ({1 + PRINTED_OFFSET}–{NPAGES + PRINTED_OFFSET}). '
                     'Tables are placed at the end of the section that discusses them; the page each '
                     'table appears on is given in its caption.']
    done12 = done36 = False
    page = None
    prev_indented, prev_text = False, ''

    for i in range(start, end):
        if i in skip: continue
        t = texts[i].replace(' \t ', ' ')
        newpage = pages and L[i]['page'] != page
        page = L[i]['page']
        if t.startswith('Keywords'):
            flush(); paras.append(t); flush()
            paras.append('## Introduction'); continue
        if t in HEADINGS and L[i]['x0'] <= LEFT + 2:
            flush()
            if t == 'Measures' and not done12:
                paras.extend([t1_, t2_]); done12 = True
            if t == 'Discussion' and not done36:
                paras.extend([t3_, t4_, t5_, t6_]); done36 = True
            if newpage: paras.append(marker(page))
            paras.append(f'{HEADINGS[t]} {t}')
            prev_indented, prev_text = False, t
            continue
        indented = INDENT - 2 <= L[i]['x0'] <= INDENT + 4
        if indented and not (prev_indented and not re.search(r'[.:?!)\u201d"]$', prev_text)):
            flush()
        if newpage:
            add(marker(page))          # mid-paragraph is fine: it sits where the page turns
        add(t)
        shape['lines'] += 1
        shape['all_indented'] = shape['all_indented'] and indented
        prev_indented, prev_text = indented, t
    flush()
    assert done12 and done36
    text = '\n\n'.join(head + [''] + paras).replace('\n\n\n', '\n\n')
    return text.replace('Abstract ', '## Abstract\n\n', 1) + '\n'

plain, paged = build(False), build(True)
open(sys.argv[2], 'w').write(plain)
print(f'plain {len(plain):,} chars -> {sys.argv[2]}')
if len(sys.argv) > 3:
    open(sys.argv[3], 'w').write(paged)
    print(f'paged {len(paged):,} chars -> {sys.argv[3]}  ({paged.count("[Page ") - 1} page markers)')
