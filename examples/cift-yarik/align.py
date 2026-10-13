import re, json, subprocess, sys
S = sys.argv[1]
txt = open(f'{S}/script.txt', encoding='utf-8').read()
lines = [l.strip() for l in txt.split('\n') if l.strip() and not re.fullmatch(r'\[[^\]]*\]', l.strip())]
SPOKEN = {"1801'de": "bin sekiz yüz bir de", "1961'de": "bin dokuz yüz altmış bir de", "1989'da": "bin dokuz yüz seksen dokuz da"}
VOW = set('aeıioöuüAEIİOÖUÜ')
def syl(w):
    w2 = SPOKEN.get(w.strip('.,…?!'), w)
    if 'Young' in w: return 1
    if 'Claus' in w: return 1
    n = sum(1 for c in w2 if c in VOW)
    return max(1, n)
# silences
out = subprocess.run(['ffmpeg','-hide_banner','-i',f'{S}/voice.mp3','-af','silencedetect=noise=-38dB:d=0.18','-f','null','-'],capture_output=True,text=True).stderr
ss = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', out)]
se = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', out)]
dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'{S}/voice.mp3'],capture_output=True,text=True).stdout)
# speech chunks between silences (first silence starts at 0)
chunks = []
cur = se[0] if ss and ss[0] < 0.05 else 0.0
starts = ss[1:] if ss and ss[0] < 0.05 else ss
ends = se[1:] if ss and ss[0] < 0.05 else se
for a, b in zip(starts, ends):
    chunks.append((cur, a)); cur = b
if cur < dur - 0.05: chunks.append((cur, dur))
chunks = [c for c in chunks if c[1]-c[0] > 0.08]
words = [[w for w in l.split()] for l in lines]
lsyl = [sum(syl(w) for w in ws) for ws in words]
speech = sum(b-a for a,b in chunks); rate = speech/sum(lsyl)
print('lines', len(lines), 'chunks', len(chunks), 'sec/syl %.3f' % rate, file=sys.stderr)
import math
N, M = len(lines), len(chunks)
INF = 1e18
dp = [[INF]*(M+1) for _ in range(N+1)]; bk = [[0]*(M+1) for _ in range(N+1)]
dp[0][0] = 0
for i in range(1, N+1):
    for j in range(1, M+1):
        for k in range(j-1, max(-1, j-5), -1):  # line i takes chunks k..j-1
            if dp[i-1][k] >= INF: continue
            d = sum(chunks[t][1]-chunks[t][0] for t in range(k, j))
            exp = lsyl[i-1]*rate
            c = math.log(d/exp)**2 + 0.15*(j-k-1)
            if dp[i-1][k] + c < dp[i][j]: dp[i][j] = dp[i-1][k] + c; bk[i][j] = k
j = M; assign = []
for i in range(N, 0, -1):
    k = bk[i][j]; assign.append((k, j)); j = k
assign.reverse()
out_words = []
for li, (k, j) in enumerate(assign):
    cs = chunks[k:j]
    total = sum(b-a for a,b in cs)
    ws = words[li]; sy = [syl(w) for w in ws]; tot = sum(sy)
    # map speech-time position -> real time
    def real(pos):
        for a, b in cs:
            if pos <= (b-a) + 1e-9: return a + pos
            pos -= (b-a)
        return cs[-1][1]
    exp_d = lsyl[li]*rate
    print(f'L{li+1:2d} chunks {k}-{j-1} {cs[0][0]:6.2f}-{cs[-1][1]:6.2f} dur {total:5.2f} exp {exp_d:5.2f}  {lines[li][:50]}', file=sys.stderr)
    # 1) decide which words belong to which chunk: split after the word whose cumulative
    #    syllable position is closest to the gap's position in speech time (prefer punctuation)
    cum = []; acc = 0
    for x in sy: acc += x; cum.append(acc / tot * total)
    splits = []; pos = 0; lo = 0
    for gi in range(len(cs)-1):
        pos += cs[gi][1]-cs[gi][0]
        cands = range(lo, len(ws)-1-(len(cs)-2-gi))
        best = min(cands, key=lambda wi: abs(cum[wi]-pos) - (0.25 if re.search(r'[…,.;:]$', ws[wi]) or re.match(r"^\d{4}'", ws[wi]) else 0))
        splits.append(best); lo = best+1
    groups = []; prev = 0
    for sp in splits: groups.append(list(range(prev, sp+1))); prev = sp+1
    groups.append(list(range(prev, len(ws))))
    # 2) within each chunk spread its words by syllables
    for (ca, cb), g in zip(cs, groups):
        gt = sum(sy[wi] for wi in g); t = ca
        for wi in g:
            d = (cb-ca) * sy[wi] / gt
            out_words.append({'text': ws[wi], 'start': round(t, 3), 'end': round(t+d, 3), 'line': li, 'lineEnd': wi == len(ws)-1})
            t += d
json.dump({'duration': dur, 'lines': lines, 'words': out_words, 'chunks': chunks, 'assign': assign}, open(f'{S}/align.json', 'w'), ensure_ascii=False, indent=1)
