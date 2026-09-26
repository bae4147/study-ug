#!/usr/bin/env python3
"""Step 2 of 2: turn the positioned lines into the text the generators read.

    python3 scripts/paper/build-text.py <lines.json> functions/paper-hafner2014.txt

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
T1 = md('Table 1. Semester of trainees (n = 23)', ['Semester', 'Number', 'Percentage'], rows1)

rows2 = [texts[i].split(' \t ') for i in range(t2[0] + 3, t2[1] + 1)]
T2 = md('Table 2. Experience concerning time management before training (n = 23)',
        ['Self-rating', 'Number', 'Percentage'], rows2)

rows3 = []
for i in range(t3[0] + 2, t3[1]):
    parts = texts[i].split(' \t ')
    rows3.append(parts + [''] * (5 - len(parts)))
T3 = md('Table 3. Zero-order correlations and Cronbach’s alpha coefficients (in parentheses) at time 1 (n = 48)',
        ['Variable', '1', '2', '3', '4'], rows3, '*p < 0.05; **p < 0.01 (two-tailed)')

rows4 = []
for i in range(t4[0] + 4, t4[1] + 1):
    parts = texts[i].split(' \t ')
    rows4.append([parts[0]] + parts[1:])
T4 = md('Table 4. Means (M) and standard deviations (SD) at the three measurement points (n = 23). '
        'Time 1 = directly before training, Time 2 = 2 weeks after, Time 3 = 4 weeks after',
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
T5 = md('Table 5. Multivariate analysis of variance for repeated measurement',
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
        'T1 = before training, T2 = 2 weeks after, T3 = 4 weeks after', hdr6, rows6)

# ---- body -------------------------------------------------------------------
start = idx('Abstract', exact=False)
end = idx('References')
skip = set(table_lines)
for i, l in enumerate(L):
    if l['top'] < 60:                                     # running heads, journal line
        skip.add(i)
for s in ('A. Häfner (*)', 'Adolf-Würth-Center', 'D-97070', 'e-mail:'):
    for i in range(start, end):
        if texts[i].startswith(s): skip.add(i)

paras, cur = [], ''
def flush():
    global cur
    if cur.strip(): paras.append(cur.strip())
    cur = ''

def add(line):
    global cur
    if cur.endswith('-'):
        m = re.search(r'([A-Za-z]+)-$', cur)
        if m and m.group(1) not in KEEP_HYPHEN and line[:1].islower():
            cur = cur[:-1] + line; return
        cur += line; return
    cur = (cur + ' ' + line) if cur else line

inserted_1_2 = inserted_3_6 = False
paras_out = ['# Decreasing students’ stress through time management training: an intervention study',
             '',
             'Alexander Häfner, Armin Stock & Verena Oberst. Eur J Psychol Educ (2015) 30:81–94. '
             'DOI 10.1007/s10212-014-0229-2. Published online 6 September 2014.']
for i in range(start, end):
    if i in skip: continue
    t = texts[i].replace(' \t ', ' ')
    if t.startswith('Keywords'):
        flush(); paras.append(t); flush()
        paras.append('## Introduction'); continue
    if t in HEADINGS and L[i]['x0'] <= LEFT + 2:
        flush()
        if t == 'Measures' and not inserted_1_2:
            paras += [T1, T2]; inserted_1_2 = True
        if t == 'Discussion' and not inserted_3_6:
            paras += [T3, T4, T5, T6]; inserted_3_6 = True
        paras.append(f'{HEADINGS[t]} {t}'); continue
    if L[i]['x0'] >= INDENT - 2 and L[i]['x0'] <= INDENT + 4:
        flush()
    add(t)
flush()
assert inserted_1_2 and inserted_3_6

text = '\n\n'.join(paras_out + [''] + paras).replace('\n\n\n', '\n\n')
text = text.replace('Abstract ', '## Abstract\n\n', 1)
open(sys.argv[2], 'w').write(text + '\n')
print(f'{len(text):,} characters, {len(paras)} blocks -> {sys.argv[2]}')
