# data/drill-words.json を生成するスクリプト（単語は人手で選定。実行: python3 tests/build-drill-words.py）
# 方針: 強勢母音が明確な語を優先。cot–caught merger など方言差のある語は note を付ける。
import json, collections

W = {}   # sound -> [(word, note)]

# CMU 発音辞書との照合で除外した語（理由つき）。品詞や方言で狙う母音が変わる語は入れない。
EXCLUDE = {
    'idea':     '/aɪˈdiːə/ 強勢は dea。狙う i が無強勢',
    'hotel':    '/hoʊˈtel/ 強勢は tel。狙う o が無強勢',
    'wallet':   'CMU は /ˈwɔːlət/ のみ。wa 語の /ɑ/ 群と割れる',
    'live':     '/lɪv/ と /laɪv/ の二通り',
    'minute':   '/ˈmɪnɪt/ と /maɪˈnjuːt/ の二通り',
    'dove':     '/dʌv/（鳥）と /doʊv/（dive の過去）の二通り',
    'our':      '/aʊr/ /ɑr/ と揺れる',
    'object':   '名 /ˈɑbdʒekt/ 動 /əbˈdʒekt/ で強勢移動',
    'contract': '名 /ˈkɑntrækt/ 動 /kənˈtrækt/ で強勢移動',
    'conflict': '名 /ˈkɑnflɪkt/ 動 /kənˈflɪkt/ で強勢移動',
}

def add(sound, words, note=None):
    for w in words.split():
        w = w.replace('_', ' ')
        if w in EXCLUDE: continue
        W.setdefault(sound, []).append((w, note))

# ---------- /ɑ/ ----------
add('ɑ', """hot pot lot not got cot dot rot shot spot knot plot slot cop top mop hop shop stop drop crop chop
box fox ox rock sock lock dock clock block knock stock shock flock job rob sob mob knob blob odd nod rod god pod
bomb calm palm father bother body copy college doctor model modern novel object problem promise possible popular
solid topic tropic profit proper common comment constant contact honest hobby hockey jockey lobby
stock option operate obvious opera olive column colony comedy conflict contract cotton follow swallow
wander watch swan yacht squad squat wad wash want wallet wallow quality quantity qualify
""")

# ---------- /æ/ ----------
add('æ', """hat cat bat rat mat sat fat pat flat chat that cap map tap nap lap gap sap trap clap snap wrap
back pack sack lack rack tack track black crack stack snack jack bad sad mad dad glad pad
bag rag tag wag flag drag brag man can pan fan ran tan van plan than hand band land sand stand grand
ham jam ram dam slam cram ant pant plant chant grant fact act pact tact tract cash dash rash crash flash trash
class glass grass pass mass brass path bath math ask task mask flask bask
apple happy habit hammer handle candle cattle battle rattle
family camera animal capital national natural actual accident action active adapt attack
balance fantasy manage magic matter pattern rapid salad talent traffic travel value
laugh half calf staff draft craft plastic dance chance answer branch
""")
add('æ', "aunt", "米語では /ænt/、地域や話者により /ɑnt/")

# ---------- /ʌ/ ----------
add('ʌ', """hut cut but nut shut gut rut strut cup up pup sup luck duck buck suck tuck truck stuck struck pluck
bus us plus thus fuss gun sun run fun bun nun pun spun stun bug hug mug rug tug dug jug plug drug shrug snug
hum gum sum drum thumb numb dumb crumb plumb rub tub sub cub hub club scrub stub
bud mud stud thud dull gull hull skull null bulb bulk hulk sulk lump bump dump jump pump thump plump
hunt punt bunt blunt stunt lunch bunch punch crunch munch hunch dust must rust trust crust gust bust just
under thunder hundred hungry husband number summer sudden supper butter button funny lucky
""")
add('ʌ', """love come some done none money mother brother other another nothing Monday month front
son ton won wonder cover color honey onion oven glove shove above dove dozen govern sponge stomach
""", "綴り o だが /ʌ/")
add('ʌ', "young country cousin enough tough rough touch double trouble couple southern", "綴り ou だが /ʌ/")
add('ʌ', "blood flood", "綴り oo だが /ʌ/")
add('ʌ', "does", "綴り oe だが /ʌ/")

# ---------- /iː/ ----------
add('iː', """seat beat heat meat neat feat eat treat wheat cheat peak leak weak speak sneak beak
see bee tee fee free tree three knee flee glee agree seed need feed weed deed bleed speed greed
feel heel peel steel wheel kneel keen seen teen green queen screen keep deep sleep sheep steep sweep creep
feet meet sweet street fleet greet sheet beef reef leaf sheaf teeth these theme scheme
leave weave sleeve grieve believe receive achieve piece niece field yield shield chief thief grief brief
key sea tea pea flea plea please tease cease lease peace piece reach teach beach each peach bleach
cheap heap leap reap deal heal meal seal steal real feel evening even female fever legal recent secret
""")

# ---------- /ɪ/ ----------
add('ɪ', """sit bit hit fit kit lit pit wit quit spit split knit grit pick sick kick lick tick thick quick trick
stick brick chick click slick flick big dig fig pig wig rig twig fill hill kill pill will still spill drill
grill chill skill thrill in pin tin win bin thin skin spin twin grin chin ship hip lip sip tip dip chip
whip skip trip drip strip grip flip slip clip snip ditch pitch witch switch rich which fish dish wish
milk silk film build built guilt busy women pretty gym hymn myth system symbol rhythm
give live river liver visit limit minute finish vivid dinner winner
""")

# ---------- /e/ ----------
add('e', """set bet get let met net pet wet yet jet vet debt sweat threat bed fed led red wed shed sled bread
dead head said thread spread pen ten hen men den then when yen bench wrench trench
bell tell sell well fell yell shell smell spell swell dwell cell egg leg beg peg
neck check deck peck wreck speck desk chest rest test nest best west vest guest quest pest
bend send lend mend tend spend blend trend friend end left kept slept wept swept
step left next text breath death health wealth stealth heavy ready steady many any
better letter never ever every seven eleven twenty plenty empty
""")

# ---------- /uː/ ----------
add('uː', """pool fool cool tool stool school spool moon soon noon spoon boom room broom bloom gloom
food mood proof boot hoot shoot loot tooth booth smooth loose goose moose choose
blue true glue clue due sue cue flu zoo too boo two who shoe canoe
soup group troupe youth through crew drew grew threw brew stew chew few new dew
suit fruit juice cruise bruise rule mule tune dune June prune rude nude crude include
move prove lose whose tomb womb do you flute lute duty ruby truly
""")
add('uː', "roof root hoof", "中西部などでは /ʊ/ とも")

# ---------- /ʊ/ ----------
add('ʊ', """pull full bull wool wolf put push bush cushion pudding butcher sugar
book look took cook hook nook brook crook shook good hood wood stood foot soot
should could would woman bosom bullet bulletin
""")

# ---------- /aɪ/ ----------
add('aɪ', """buy tie lie die pie my by why fly sky shy dry try cry fry spy sly
ride side hide wide tide bride pride slide glide guide bike hike like mike pike spike strike
time lime dime mime chime crime prime climb line fine mine nine pine wine shine spine
five dive hive drive strive thrive life wife knife strife
light night right sight tight fight might bright flight slight height
high sigh thigh nigh mind kind find bind blind grind child mild wild
eye ice rice nice mice dice price slice spice twice white bite kite site write quite
island aisle style type tire cycle idea item icon iron final silent private rival pilot
""")

# ---------- /eɪ/ ----------
add('eɪ', """bay day may pay say way lay ray play pray stay gray tray spray
made fade wade shade grade trade blade spade make take lake bake cake wake shake snake brake
name game came same fame tame flame frame shame blame lane cane mane plane crane
late gate date hate fate mate rate plate state skate crate
face race lace pace place space trace grace brace
rain main gain pain train brain chain stain plain grain drain
wait bait paint faint saint aim claim maid paid raid braid
eight weight freight neighbor they grey prey obey vein veil
able table cable label paper baby lady crazy lazy basic nation station famous danger
""")
add('eɪ', "great break steak", "綴り ea だが /eɪ/")

# ---------- /ɔɪ/ ----------
add('ɔɪ', """boy toy joy coy soy ploy Roy annoy enjoy employ destroy
oil boil coil foil soil toil spoil coin join loin groin point joint
noise poise voice choice moist hoist joist
royal loyal oyster voyage
""")

# ---------- /aʊ/ ----------
add('aʊ', """now how cow vow wow brow plow allow
out shout about loud cloud proud sound round ground pound found mound hound bound
house mouse louse blouse mouth south
town down gown brown crown frown drown clown
owl fowl howl growl scowl
count mount fountain mountain announce bounce ounce pounce
doubt scout trout sprout sour flour hour our power tower shower flower
""")

# ---------- /oʊ/ ----------
add('oʊ', """no go so hoe toe foe woe doe
boat coat goat moat float road load toad
bone cone tone zone phone stone throne alone
home dome comb foam roam
hope rope cope slope scope soap
note vote wrote quote coat
rose nose those close chose pose hose froze
know show grow throw slow snow flow glow blow crow low owe own
old cold bold fold gold hold sold told scold
most post host ghost coast toast roast boast
open over only motor total local vocal hotel program notice ocean moment
soul goal coal roll toll stroll poll
""")
add('oʊ', "don't won't both", None)

# ---------- /ɔː/ ----------
add('ɔː', """law saw jaw raw draw claw flaw straw paw
talk walk chalk stalk
ball call fall hall mall tall wall small stall
thought bought caught taught fought brought ought sought
dawn lawn fawn pawn yawn drawn
cause pause clause applause
salt halt malt false
author autumn august auction audience
""", "cot–caught merger 地域では /ɑ/ と同音")
add('ɔː', "boss loss toss cross moss floss cost frost lost soft off often coffee cloth broth dog log fog hog frog smog blog jog long song strong wrong belong gone", "CLOTH 語。非 merger の米語では /ɔː/、merger 地域では /ɑ/")

# ---------- R-vowels ----------
add('ɝː', """bird word girl nurse hurt turn burn learn earn earth first third shirt skirt dirt
her fur sir stir blur slur purr
work worm world worth worse worst
serve nerve verb herb term germ perm
church search purse curse verse
early pearl heard hurdle turtle purple further murder
""")
add('ɑr', """car far bar jar star scar
card hard yard guard lard
park dark mark bark shark spark
part cart art heart smart start chart
arm farm harm charm alarm
large charge barge
barn yarn darn
garden market party partner
""")
add('ɔr', """for or nor door floor
more core sore tore bore shore store score snore
born corn horn torn worn thorn morn
short sport port fort sort
form storm norm dorm
north force horse course source
order border corner forest normal
war warm warn ward toward
""")
add('ɪr', """ear near dear fear gear hear clear year rear spear
beer deer cheer steer peer sheer
here mere sphere severe
weird pierce fierce
period serious series
""")
add('er', """air hair fair pair chair stair
care dare fare rare scare share spare stare square
bear pear wear swear
there where their
very berry cherry merry
""")


# ---------- 弱音節（schwa 系）----------
# 強勢のない音節の母音。英語で最も多い音だがフォニックスの最後に来る。
# ここだけは「語のどの位置の母音か」を綴りの規則で決め、CMU でその位置が
# 本当に無強勢（AH0 / IH0 / ER0 / IY0）かを検証する（WEAK_PATTERNS）。
# 強勢母音として既に収録済みの語も、赤字にする位置が違えば別問題として出す。
WEAK = []   # (sound, word, hl_regex, vowel_index, expected_arpa, note)

def addw(sound, words, rx, idx, arpa, note=None):
    for w in words.split():
        WEAK.append((sound, w, rx, idx, arpa, note))

# /ə/ 語末の a
addw('ə', """sofa comma extra drama zebra panda pizza villa quota china tuna cinema camera banana
arena agenda formula umbrella America Canada idea_ opera_ soda cobra plaza data delta media
""".replace('idea_', '').replace('opera_', ''), r'a$', -1, 'AH0')
# /ə/ 語頭の a
addw('ə', """about above along ago alone awake asleep away again against ahead across
allow amaze appear apart attend attack alarm account achieve adopt afraid agree
""", r'^a', 0, 'AH0')
# 語頭 a- でも r が続くと r 性の弱母音になる
addw('ɚ', """around arrive""", r'^a', 0, 'ER0')
# /ə/ 語末 -on / -en / -ain（弱く読む音節）
addw('ə', """lemon wagon bacon ribbon cotton button carbon dragon reason season prison poison
common lesson person_ cannon salmon melon
""".replace('person_', ''), r'o(?=n$)', -1, 'AH0')
addw('ə', """kitten listen happen sudden garden golden often oven chicken broken taken given
seven eleven heaven kitchen_ frozen wooden written hidden
""".replace('kitchen_', ''), r'e(?=n$)', -1, 'AH0')
addw('ə', """even""", r'e(?=n$)', -1, 'IH0')
addw('ə', """mountain captain certain fountain curtain bargain""", r'ai(?=n$)', -1, 'AH0')
# /ə/ consonant-le（6 番目の音節タイプ）
addw('ə', """table little apple candle handle simple people purple middle bottle battle cattle
rattle circle uncle single ankle title bubble puzzle needle noodle castle whistle jungle
""", r'le$', -1, 'AH0', 'consonant-le。子音 + le の母音は /ə/')
# /ə/ 語末 -al / -el / -il / -ol
addw('ə', """animal capital hospital medal metal total local legal signal final normal pedal
travel level model novel camel tunnel pencil April evil April_ symbol pistol
""".replace('April_', ''), r'[aeio](?=l$)', -1, 'AH0')
# /ə/ 語末 -ous
addw('ə', """famous nervous serious various dangerous jealous curious obvious enormous""", r'ou(?=s$)', -1, 'AH0')
# /ɚ/ 弱音節の r（-er / -or / -ar）
addw('ɚ', """hammer butter summer number water sister winter better letter dinner finger paper
teacher weather mother brother father another under thunder cover offer answer corner
""", r'er$', -1, 'ER0')
addw('ɚ', """doctor actor color mirror major dollar collar sugar grammar tractor visitor sailor
""", r'(or|ar)$', -1, 'ER0')
# /i/ 語末の y / ey（happy tensing）
addw('i', """happy city very funny lucky money family baby lady study copy body busy easy
angry hungry pretty empty party ready heavy story sorry carry hurry
""", r'y$', -1, 'IY0')
addw('i', """valley monkey donkey turkey hockey journey chimney honey money_""".replace('money_', ''), r'ey$', -1, 'IY0')

# ---------- 強調範囲（その音に対応する綴り）の推定 ----------
import re
HL_PATTERNS = {
 'ɑ': [r'(?<=[wW])a(?=[a-z])', r'(?<=qu)a', r'ya', r'al(?=m\b)', r'o', r'a'],
 'æ': [r'au', r'a'],
 'ʌ': [r'u', r'oo', r'ou', r'oe', r'o'],
 'iː': [r'ee', r'ea', r'ie', r'ei', r'ey', r'e'],
 'ɪ': [r'ui', r'i', r'y', r'u', r'o', r'e'],
 'e': [r'ea', r'ai', r'ie', r'e', r'a'],
 'uː': [r'oo', r'ou', r'ew', r'ue', r'ui', r'oe', r'u', r'o'],
 'ʊ': [r'oo', r'ou', r'u', r'o'],
 'aɪ': [r'eye', r'igh', r'uy', r'ei', r'ai', r'ie', r'y', r'i'],
 'eɪ': [r'eigh', r'ai', r'ay', r'ei', r'ey', r'ea', r'a'],
 'ɔɪ': [r'oi', r'oy'],
 'aʊ': [r'ou', r'ow'],
 'oʊ': [r'oa', r'ow', r'oe', r'ou', r'o'],
 'ɔː': [r'ough', r'augh', r'aw', r'au', r'a', r'o'],
 'ɝː': [r'ear', r'ur', r'ir', r'er', r'or'],
 'ɑr': [r'ear', r'ar'],
 'ɔr': [r'oor', r'our', r'ore', r'oar', r'or', r'ar'],
 'ɪr': [r'eer', r'ear', r'ere', r'ier', r'eir', r'er'],
 'er': [r'air', r'are', r'ear', r'ere', r'eir', r'err', r'er'],
}
# 語ごとの手動指定（強勢母音が最初のクラスタでない語など）: word -> (start, end)
OVERRIDE = {
 'attack': (3, 4), 'adapt': (2, 3), 'eleven': (2, 3), 'another': (2, 3), 'include': (4, 5),
 'about': (2, 4), 'allow': (3, 5), 'announce': (3, 5), 'annoy': (3, 5), 'enjoy': (3, 5), 'employ': (4, 6), 'destroy': (5, 7),
 'believe': (3, 5), 'receive': (3, 5), 'achieve': (3, 5), 'agree': (3, 5), 'obey': (2, 4), 'canoe': (3, 5),
 'severe': (3, 6), 'toward': (3, 5), 'applause': (4, 6), 'alarm': (2, 4), 'above': (2, 3),
 'busy': (1, 2), 'pretty': (2, 3), 'forest': (1, 3), 'two': (1, 3), 'eye': (0, 3), 'who': (2, 3), 'shoe': (2, 4),
}
def highlight(word, sound):
    if word in OVERRIDE: return list(OVERRIDE[word])
    for pat in HL_PATTERNS.get(sound, []):
        m = re.search(pat, word, re.I)
        if m: return [m.start(), m.end()]
    return None

# ---------- フォニックス: 綴りパターン g とステージ st ----------
# 音節タイプ順（閉音節 → 開音節/マジック e → 母音チーム → r 音 → 二重母音ほか）。
# Reading Universe / Five from Five の scope & sequence と、Hanna(1967)/Fry(2004) の
# 綴り頻度（閉音節の一字母音は 86〜97% 安定）にもとづく並び。
R_SOUNDS = {'ɑr', 'ɔr', 'ɪr', 'er', 'ɝː'}
SHORT = {'æ', 'ɪ', 'ɑ', 'ʌ', 'e'}
LONG = {'eɪ', 'aɪ', 'oʊ', 'uː', 'iː'}
OPEN_LONG = {('a', 'eɪ'), ('i', 'aɪ'), ('o', 'oʊ'), ('e', 'iː'), ('u', 'uː'), ('y', 'aɪ')}

def grapheme(word, hl):
    a, b = hl
    g = word[a:b].lower()
    if re.fullmatch(r'[^aeiouy]e', word[b:]): g += '_e'   # マジック e
    return g

def stage(g, sound):
    if sound in R_SOUNDS: return 'P4'          # r 性母音
    if sound in SHORT: return 'P1'             # 閉音節の短母音（綴り例外もここ）
    if sound in LONG:
        if g.endswith('_e') and len(g) == 3: return 'P2'   # マジック e（a_e i_e o_e u_e e_e y_e）
        if (g, sound) in OPEN_LONG: return 'P2'            # 開音節
        return 'P3'                                        # 母音チーム（ea_e, ie_e なども）
    return 'P5'                                # aʊ ɔɪ ʊ ɔː

# ---------- CMU 発音辞書との照合 ----------
# tests/cmudict.dict（gitignore。https://github.com/cmusphinx/cmudict の cmudict.dict）が
# あれば全語の強勢母音を機械照合し、派生データ tests/cmu-vowels.json を書き出す。
# 辞書が無い環境では照合をスキップするが、書き出し済みの JSON を data.test.js が検査する。
import os, urllib.request

ARPA_IPA = {'AA': 'ɑ', 'AE': 'æ', 'AH': 'ʌ', 'AO': 'ɔː', 'AW': 'aʊ', 'AY': 'aɪ', 'EH': 'e',
            'ER': 'ɝː', 'EY': 'eɪ', 'IH': 'ɪ', 'IY': 'iː', 'OW': 'oʊ', 'OY': 'ɔɪ', 'UH': 'ʊ', 'UW': 'uː'}
# R が続くときの r 性母音
ARPA_IPA_R = {'ɑ': 'ɑr', 'ɔː': 'ɔr', 'ɪ': 'ɪr', 'iː': 'ɪr', 'e': 'er', 'eɪ': 'er',
              'ʌ': 'ɝː', 'oʊ': 'ɔr', 'ʊ': 'ʊr', 'aʊ': 'aʊr', 'ɝː': 'ɝː'}

# CMU と食い違うが意図的に採用している語（方言差）。理由を必ず書く。
DIALECT_OK = {
    'raw': 'CMU は merger 側の /ɑ/ のみ。非 merger 米語では /ɔː/',
    'floss': 'CLOTH 語。CMU は /ɑ/、非 merger 米語では /ɔː/',
    'hog': 'CLOTH 語。CMU は /ɑ/、非 merger 米語では /ɔː/',
    'frog': 'CLOTH 語。CMU は /ɑ/、非 merger 米語では /ɔː/',
    'smog': 'CLOTH 語。CMU は /ɑ/、非 merger 米語では /ɔː/',
    'jog': 'CLOTH 語。CMU は /ɑ/、非 merger 米語では /ɔː/',
}
CMU_MISSING = {'perm': 'CMU 未収録。/pɝːm/ で確定的なので採用'}

CMU_PATH = os.environ.get('CMUDICT') or os.path.join(os.path.dirname(__file__), 'cmudict.dict')
CMU_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict'

def load_cmu(path):
    if not os.path.exists(path):
        try:
            print('cmudict を取得中…', CMU_URL)
            urllib.request.urlretrieve(CMU_URL, path)
        except Exception as ex:
            print('cmudict を取得できません（照合をスキップ）:', ex)
            return None
    d = collections.defaultdict(list)
    for line in open(path, encoding='utf-8'):
        line = line.split('#')[0].strip()
        if not line: continue
        parts = line.split()
        d[re.sub(r'\(\d+\)$', '', parts[0])].append(parts[1:])
    return d

def vowel_seq(phones):
    """母音音素を出現順に返す（'AH0' のような base+stress の文字列）"""
    return [p for p in phones if re.match(r'[A-Z]+[0-2]$', p) and re.match(r'([A-Z]+)', p).group(1) in ARPA_IPA]

def stressed_vowels(phones):
    """主強勢(1)の母音を IPA で返す。R が続けば r 性母音にする。"""
    out = []
    for i, p in enumerate(phones):
        m = re.match(r'([A-Z]+)([0-2])$', p)
        if not m: continue
        base, stress = m.group(1), m.group(2)
        if base not in ARPA_IPA or stress != '1': continue
        ipa = ARPA_IPA[base]
        if base == 'ER' or (i + 1 < len(phones) and phones[i + 1] == 'R'):
            ipa = ARPA_IPA_R.get(ipa, ipa)
        out.append(ipa)
    return out

CMU = None
WEAK_OK = {}   # 'word@start,end' -> 検証に通った ARPA（無強勢）

def build_weak():
    """弱音節（schwa 系）の語を作る。赤字位置は綴りの規則、無強勢かどうかは CMU で検証する。"""
    out = []
    if CMU is None:
        print('cmudict が無いので弱音節の語を作れません'); return out
    bad = []
    for sound, word, rx, idx, arpa, note in WEAK:
        m = re.search(rx, word)
        if not m: bad.append((word, f'赤字位置の規則 {rx} が当たらない')); continue
        pron = CMU.get(word.lower())
        if not pron: bad.append((word, 'CMU 未収録')); continue
        got = [vowel_seq(x) for x in pron]
        if not any(len(v) > abs(idx) - (0 if idx < 0 else 1) and v[idx] == arpa for v in got):
            bad.append((word, f'{idx} 番目の母音が {arpa} でない: {[" ".join(v) for v in got]}')); continue
        WEAK_OK[f'{word}@{m.start()},{m.end()}'] = arpa
        e = {"word": word, "sound": sound, "hl": [m.start(), m.end()], "st": "P6"}
        e["g"] = word[m.start():m.end()].lower()
        if note: e["note"] = note
        out.append(e)
    assert not bad, '弱音節の検証に失敗:\n' + '\n'.join(f'  {w}: {r}' for w, r in bad)
    return out

def verify(entries):
    cmu = CMU
    if cmu is None: return
    vowels, bad, missing = {}, [], []
    for e in entries:
        if e.get('st') == 'P6': continue     # 弱音節は build_weak() で位置ごとに検証済み
        key = e['word'].lower()
        cand = sorted({v[0] for v in (stressed_vowels(p) for p in cmu.get(key, [])) if v})
        if not cand:
            if key not in CMU_MISSING: missing.append(e['word'])
            continue
        vowels[e['word']] = cand
        if e['sound'] not in cand and e['word'] not in DIALECT_OK:
            bad.append((e['word'], e['sound'], cand))
    # 赤字が語末の母音字にあるのに CMU ではそこが無強勢、という取り違えを検出する
    misplaced = []
    for e in entries:
        if e.get('st') == 'P6' or 'hl' not in e: continue
        groups = [m.span() for m in re.finditer(r'[aeiouy]+', e['word'], re.I)]
        if len(groups) < 2 or e['hl'][0] < groups[-1][0]: continue
        vs = [vowel_seq(p) for p in cmu.get(e['word'].lower(), [])]
        if vs and all(v and v[-1].endswith('0') for v in vs):
            misplaced.append((e['word'], e['hl'], [' '.join(v) for v in vs]))
    assert not misplaced, '赤字が無強勢の語末母音に載っている（OVERRIDE で直すこと）: ' + repr(misplaced)
    assert not bad, 'CMU と不一致（EXCLUDE か DIALECT_OK に入れて理由を書くこと）: ' + repr(bad)
    assert not missing, 'CMU 未収録（CMU_MISSING に入れて理由を書くこと）: ' + repr(missing)
    json.dump({'note': 'CMU Pronouncing Dictionary から生成した強勢母音。build-drill-words.py が書き出す。',
               'source': CMU_URL, 'dialect_ok': DIALECT_OK, 'cmu_missing': CMU_MISSING,
               'vowels': vowels, 'weak': WEAK_OK},
              open(os.path.join(os.path.dirname(__file__), 'cmu-vowels.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'CMU 照合 OK: {len(vowels)} 語（方言差 {len(DIALECT_OK)} 語、未収録 {len(CMU_MISSING)} 語は明示的に許容）')


# ---------- フォニックス・コース（7 ステージ / 26 ステップ）----------
# sel の指定: st=ステージ, upto=そのステージまで累積, g=綴りパターン, note=方言・例外語,
#             sounds=選択肢に出す音（未指定なら該当語に現れる音すべて）
# 既存モード用: 紛らわしい音の対応表（選択肢が 6 つ以上の総合ステップで 3 択を作る）
NEIGHBORS = {
 'ɑ':  ['æ', 'ʌ', 'ɔː', 'oʊ'],   'æ':  ['ɑ', 'ʌ', 'e'],
 'ʌ':  ['æ', 'ɑ', 'ʊ', 'ɔː'],    'e':  ['æ', 'ɪ', 'eɪ', 'iː'],
 'ɪ':  ['iː', 'e', 'ɪr'],        'iː': ['ɪ', 'e', 'eɪ'],
 'uː': ['ʊ', 'oʊ', 'ʌ'],         'ʊ':  ['uː', 'ʌ', 'oʊ'],
 'aɪ': ['eɪ', 'ɑ', 'ɔɪ'],        'eɪ': ['e', 'aɪ', 'iː'],
 'ɔɪ': ['ɔː', 'aɪ', 'oʊ'],       'aʊ': ['oʊ', 'ɑ', 'ɔː'],
 'oʊ': ['ɔː', 'ʌ', 'aʊ', 'uː'],  'ɔː': ['ɑ', 'oʊ', 'ʌ', 'aʊ'],
 'ɝː': ['ɑr', 'ɔr', 'er', 'ɪr'], 'ɑr': ['ɔr', 'ɝː', 'ɑ'],
 'ɔr': ['ɑr', 'ɝː', 'oʊ'],       'ɪr': ['ɝː', 'er', 'iː'],
 'er': ['ɪr', 'ɝː', 'e'],
 'ə':  ['ʌ', 'ɪ', 'e', 'ɑ'],     'ɚ':  ['ɝː', 'ə', 'ʌ', 'ɔr'],   'i':  ['iː', 'ɪ', 'eɪ'],
}
for _a, _b in [('ʌ', 'ə'), ('e', 'ə'), ('ɪ', 'ə'), ('ɪ', 'i'), ('iː', 'i'), ('ɝː', 'ɚ'), ('ɔr', 'ɚ'), ('ɑ', 'ə')]:
    NEIGHBORS[_a].append(_b)

# 英語耳の区分＝日本語話者が 1 つの音に潰してしまう音のまとまり。
# 選択肢はここから作る（フォニックスは「どの語を出すか」だけを決める）。
EIGO_GROUPS = [
 {"id": "v01", "title": "顎の開き（body / bat / but）", "sounds": ['ɑ', 'æ', 'ʌ', 'ə']},
 {"id": "v02", "title": "舌の高さ", "sounds": ['iː', 'ɪ', 'e', 'i']},
 {"id": "v03", "title": "唇の緊張", "sounds": ['uː', 'ʊ']},
 {"id": "v04", "title": "出発点の口", "sounds": ['aɪ', 'eɪ', 'ɔɪ']},
 {"id": "v05", "title": "出発点の開き", "sounds": ['aʊ', 'oʊ']},
 {"id": "v06", "title": "唇の丸め", "sounds": ['ɔː', 'ɑ']},
 {"id": "v07", "title": "r の前の母音", "sounds": ['ɝː', 'ɑr', 'ɔr', 'ɚ']},
 {"id": "v08", "title": "ear / air / are", "sounds": ['ɪr', 'er', 'ɑr']},
 # 特別講義 p.75 が対にしている組。Lesson では v05 と v06 に分かれてしまうので、
 # 選択肢を作るときはここで結びつける
 {"id": "v09", "title": "オウとオー（特別講義 p.75）", "sounds": ['oʊ', 'ɔː']},
]

def build_eigo():
    """音 -> 英語耳で同じまとまりに入る他の音"""
    out = collections.defaultdict(list)
    for g in EIGO_GROUPS:
        grp = g["sounds"]
        for a in grp:
            for b in grp:
                if a != b and b not in out[a]: out[a].append(b)
    return dict(out)

def build_gsounds(entries):
    """綴り -> その綴りが実際に取る音（語数の多い順）。読み違えの選択肢に使う"""
    c = collections.defaultdict(collections.Counter)
    for e in entries: c[e["g"]][e["sound"]] += 1
    return {g: [[s, n] for s, n in cc.most_common()] for g, cc in c.items()}

# ---------- 英語耳（改訂3版）第3章 母音編 の Lesson との対応 ----------
# 目次 p.008-009 より。Lesson を音声で練習し終えたら、その音を狙ったドリルに来る。
# 語のプールは「その Lesson の音 ＋ 英語耳で同じまとまりに入る音」、
# 出題の 6 割をその Lesson の音（focus）に寄せる。
LESSONS = [
 (13, '[ɑ]',            'めいっぱい口を開けた「ア」',              62, ['ɑ']),
 (14, '[æ]',            '舌が前にある音',                          64, ['æ']),
 (15, '[ʌ]',            'のどの奥から短く出す「ア」',              66, ['ʌ']),
 (16, '[iː][ɪ][e]',     '口の開け方で変わる 3 種の音',             69, ['iː', 'ɪ', 'e', 'i']),
 (17, '[uː][ʊ]',        'uː は日本語よりも口をすぼめて出す「ウ」',  71, ['uː', 'ʊ']),
 (18, '[aɪ][eɪ][ɔɪ]',   '小さな「ィ」をなめらかにそえる',          72, ['aɪ', 'eɪ', 'ɔɪ']),
 (19, '[aʊ][oʊ]',       '小さな「ゥ」をなめらかにそえる',          73, ['aʊ', 'oʊ']),
 (20, '[ɔː]',           '口の奥でよく響かせた「オー」',            74, ['ɔː']),
 (21, '[ɝː]',           '舌を水平に持ち上げて思い切りうなる',      76, ['ɝː']),
 (22, '[ɚ]',            '舌を水平に持ち上げて短くうなる',          78, ['ɚ']),
 (23, '[ɑɚ]',           '[ɑ] から [ɚ] へなめらかに移行する',       79, ['ɑr']),
 (24, '[ɔɚ]',           '[ɔ] から [ɚ] へなめらかに移行する',       80, ['ɔr']),
 (25, '[ə]',            '地味だけど一番よく出てくる、弱くあいまいな音', 83, ['ə']),
]
# 特別講義（目次 p.011）のうち母音にかかわるもの。Lesson をまたいだ区別を扱う
SPECIALS = [
 ('S1', '[ɑ] [æ] [ʌ] などの区別',   68, ['ɑ', 'æ', 'ʌ'],                        'body / bat / but。日本語ではどれも「ア」'),
 ('S2', '[oʊ] と [ɔː] の区別',       75, ['oʊ', 'ɔː'],                           'オウ（動く）とオー（動かない）。日本語ではどちらも「オー」'),
 ('S3', '「ア」「オ」系のまとめ',      81, ['ɑ', 'æ', 'ʌ', 'ə', 'ɔː', 'oʊ', 'aʊ'], 'ア系とオ系をまとめて。第3章の総仕上げ'),
]

# 本書の母音編に対応する Lesson が無い音（ドリルには入っている）
NO_LESSON = {'ɪr': 'ear 型。母音編に単独の Lesson は無い（第4章 R編で扱う）',
             'er': 'air / are 型。母音編に単独の Lesson は無い（第4章 R編で扱う）'}

def build_lessons():
    out = []
    for n, ipa, title, page, focus in LESSONS:
        partners = []
        for g in EIGO_GROUPS:
            if any(f in g["sounds"] for f in focus):
                partners += [x for x in g["sounds"] if x not in focus and x not in partners]
        out.append({"n": n, "ipa": ipa, "title": title, "page": page,
                    "focus": focus, "sounds": sorted(set(focus) | set(partners))})
    return out

def special_steps():
    return [{"id": sid, "title": f'特別講義 {title}', "hint": f'{hint}（p.{page}）',
             "focus": sounds, "sel": {"sounds": sounds}} for sid, title, page, sounds, hint in SPECIALS]

def lesson_steps(lessons):
    steps = []
    for L in lessons:
        steps.append({"id": f'L{L["n"]}', "title": f'Lesson {L["n"]} {L["ipa"]}',
                      "hint": f'{L["title"]}（p.{L["page"]}）',
                      "focus": L["focus"], "sel": {"sounds": L["sounds"]}})
    return steps

MIN_STEP = 40      # 1 ステップの最少語数
STAGE_META = [
 ("P1", "1. 閉音節 — 短母音", "一字の母音は 86〜97% この音。ここが土台"),
 ("P2", "2. 開音節とマジック e — 長母音", "母音字の名前どおりに読む"),
 ("P3", "3. 母音チーム", "2 字以上で 1 つの母音"),
 ("P4", "4. r 性母音", "日本語話者に最難。ここは時間をかける"),
 ("P5", "5. 二重母音とその他", "ou / ow, oi / oy, oo, au / aw"),
 ("P6", "6. 弱音節 — schwa と consonant-le", "強勢の無い音節。英語でいちばん多い母音"),
]
# ステージ内で先に出したい綴り（残りは語数の多い順）
GORDER = {
 "P1": ["a", "i", "o", "u", "e"],
 "P2": ["a_e", "i_e", "o_e", "u_e", "a", "i", "o", "e", "y"],
 "P3": ["ee", "ea", "ai", "ay", "igh", "ie", "oa", "ow", "ew", "ue"],
 "P4": ["ar", "or", "er", "ir", "ur", "ear", "air", "are", "eer", "ere", "ore"],
 "P5": ["ou", "ow", "oi", "oy", "oo", "aw", "au", "al", "ough"],
 "P6": ["le", "er", "or", "a", "o", "e", "y", "ey", "ai", "ou"],
}

def pack(by_g, order):
    """綴りを語数 MIN_STEP 以上・音 2 つ以上のかたまりに詰める。端数は最後へ"""
    steps, cur = [], []
    for g in order:
        cur.append(g)
        n = sum(len(by_g[x]) for x in cur)
        snd = {e["sound"] for x in cur for e in by_g[x]}
        if n >= MIN_STEP and len(snd) >= 2: steps.append(cur); cur = []
    if cur:
        if steps: steps[-1].extend(cur)
        else: steps.append(cur)
    return steps

def gtitle(gs):
    show = [g.replace("_e", "_e") for g in gs[:6]]
    return " / ".join(show) + (" …" if len(gs) > 6 else "")

def examples(entries, n=2):
    """ステップの見出しに出す例語。規則の例外語は避ける（方言注記の語は使ってよい）"""
    plain = [e for e in entries if not e.get("ex")]
    return " ".join(e["word"] for e in (plain or entries)[:n])

def build_course(entries):
    """本コース: 音節タイプ順に、すべての綴りをちょうど 1 回ずつ通る。
       追加コース: 罠・方言・累積総合（進捗には数えない）。"""
    course = []
    for st, title, hint in STAGE_META:
        ws = [e for e in entries if e.get("st") == st]
        by_g = collections.defaultdict(list)
        for e in ws: by_g[e["g"]].append(e)
        rest = sorted([g for g in by_g if g not in GORDER[st]], key=lambda g: -len(by_g[g]))
        order = [g for g in GORDER[st] if g in by_g] + rest
        steps = []
        for i, gs in enumerate(pack(by_g, order)):
            steps.append({"id": f"{st}-{i + 1}", "title": gtitle(gs),
                          "hint": examples(sum((by_g[g] for g in gs), []), 3),
                          "sel": {"st": [st], "g": sorted(gs)}})
        steps.append({"id": f"{st}-all", "title": "ステージ総合",
                      "hint": "このステージの綴りをまとめて", "sel": {"st": [st]}})
        course.append({"id": st, "title": title, "hint": hint, "steps": steps})

    # --- 追加コース（進捗に数えない）---
    by_g = collections.defaultdict(collections.Counter)
    for e in entries: by_g[e["g"]][e["sound"]] += 1
    amb = {g: [s for s, n in c.most_common() if n >= 4] for g, c in by_g.items()}
    amb = {g: ss for g, ss in amb.items() if len(ss) >= 2}
    traps = []
    for i, g in enumerate(sorted(amb, key=lambda g: -sum(by_g[g][s] for s in amb[g]))):
        if sum(by_g[g][x] for x in amb[g]) < MIN_STEP: continue
        traps.append({"id": f"T-{g}", "title": g, "hint": "同じ綴りで音が割れる",
                      "sel": {"g": [g], "sounds": sorted(amb[g])}})
    extra = [
      {"id": "X", "title": "追加ドリル（進捗には数えません）", "hint": "本コースの語を別の切り口で回す", "extra": True, "steps": [
        {"id": "X-shortlong", "title": "短母音 vs 長母音", "hint": "hat↔hate, hop↔hope", "sel": {"st": ["P1", "P2"]}},
        {"id": "X-weak", "title": "強い音節 vs 弱い音節", "hint": "同じ語でも赤字の位置で音が変わる", "sel": {"st": ["P1", "P2", "P6"]}},
        {"id": "X-note", "title": "方言差と綴り例外", "hint": "cot–caught merger、CLOTH 語ほか", "sel": {"note": True}},
        {"id": "X-all", "title": "全母音（総合）", "hint": "収録語すべてから出題", "sel": {"upto": "P6"}},
      ]},
      {"id": "L", "title": "英語耳 Lesson 別（第3章 母音編）", "extra": True,
       "hint": "本の Lesson を音声で練習し終えたら、ここでその音の語を大量にこなす。出題の 6 割がその Lesson の音",
       "steps": lesson_steps(LESSON_DATA) + special_steps()},
      {"id": "T", "title": "一綴り多音の罠（進捗には数えません）", "hint": "同じ綴りで音が割れる語だけを集めた識別ドリル", "extra": True, "steps": traps},
    ]
    return course + extra

ORDER = ["P1", "P2", "P3", "P4", "P5", "P6"]

def select(entries, sel):
    """COURSE の sel でエントリを絞る（app.js の同名処理と揃えること）"""
    out = entries
    if "st" in sel: out = [e for e in out if e.get("st") in sel["st"]]
    if "upto" in sel:
        lim = ORDER.index(sel["upto"])
        out = [e for e in out if e.get("st") in ORDER[:lim + 1]]
    if "g" in sel: out = [e for e in out if e.get("g") in sel["g"]]
    if sel.get("note"): out = [e for e in out if e.get("note")]
    if "sounds" in sel: out = [e for e in out if e["sound"] in sel["sounds"]]
    return out

def check_course(course, entries):
    seen_g, ids = set(), set()
    for stg in course:
        print(f'{stg["title"]}')
        for stp in stg["steps"]:
            ws = select(entries, stp["sel"])
            snds = sorted({w["sound"] for w in ws})
            assert stp["id"] not in ids, f'ステップ id が重複: {stp["id"]}'
            ids.add(stp["id"])
            assert len(ws) >= MIN_STEP, f'{stp["id"]} の語が少なすぎる: {len(ws)}'
            assert len(snds) >= 2, f'{stp["id"]} の選択肢が {len(snds)} 個'
            stp["n"] = len(ws); stp["sounds"] = snds
            if len(snds) > 5:
                stp["mix"] = True    # 既存モード: 毎問 3 択を作る
                assert len(snds) >= 3, f'{stp["id"]} は 3 択を作れない'
            # ミックスモード: 本コースはどの語にも「綴りの罠」か「英語耳の罠」が 2 つ以上あること。
            # 英語耳 Lesson 別のように音を絞ったステップは 1 つでよい（残りはアプリが他の音から補う）
            need = 1 if stg.get("extra") else 2
            for w in ws:
                cand = {x for x, _ in GSOUNDS[w["g"]]} | set(EIGO.get(w["sound"], [])) | set(snds)
                cand.discard(w["sound"])
                assert len(cand) >= need, f'{stp["id"]} の {w["word"]} は選択肢を作れない'
            if not stg.get("extra"):
                for g in stp["sel"].get("g", []): seen_g.add((stp["sel"]["st"][0], g))
            print(f'  {stp["id"]:12} {stp["title"]:26} {len(ws):5} 語  {"/".join(snds)}')
    # 本コースが全綴りを漏れなく 1 回ずつ通っているか
    allg = {(e["st"], e["g"]) for e in entries}
    assert seen_g == allg, f'綴りの過不足: 未収録 {sorted(allg - seen_g)} / 余分 {sorted(seen_g - allg)}'
    main = [t for stg in course if not stg.get("extra") for t in stg["steps"]]
    print(f'本コース {len(main)} ステップ（うち綴り別 {len(main) - len(STAGE_META)}）、追加 {len(ids) - len(main)} ステップ')

# ---------- 一行ルール（間違えたときに出す）----------
# MOUTH: 英語耳の軸＝口の作り方。GRULE: フォニックスの軸＝綴りの読み方。
# どちらも「超簡潔」を優先し、1 行 30 字程度に収める。
MOUTH = {
 'ɑ':  '顎を大きく開けて「アー」',            'æ':  '口を横に広げて「エァ」',
 'ʌ':  '口をあまり開けず短く「ア」',          'ə':  '力を抜いて曖昧に。弱く速く',
 'e':  '「エ」より少し口を開く',              'ɪ':  '「イ」と「エ」の中間。力を抜く',
 'iː': '唇を横に引いて緊張させ長く',          'i':  '語末の軽い「イ」。短く弱く',
 'ʊ':  '唇を丸めず力を抜いた「ウ」',          'uː': '唇を強く丸めて突き出す',
 'eɪ': '「エ」から「イ」へ滑らす',            'aɪ': '「ア」から「イ」へ滑らす',
 'ɔɪ': '「オ」から「イ」へ滑らす',            'aʊ': '「ア」から「ウ」へ滑らす',
 'oʊ': '「オ」から「ウ」へ。唇を丸めていく',  'ɔː': '唇を丸めて「オー」',
 'ɝː': '舌を丸めて「アー」。唇は丸めない',    'ɚ':  '/ɝː/ を弱く短く。語尾で力を抜く',
 'ɑr': '「アー」のあと舌を丸める',            'ɔr': '「オー」のあと舌を丸める',
 'ɪr': '「イァ」のあと舌を丸める',            'er': '「エァ」のあと舌を丸める',
}
# 段階ごとの一般則。その綴りにパターンが 1 つも無いとき（例外だけの綴り）に使う
SRULE = {
 'P1': '子音で閉じた音節の母音は短く読む',
 'P2': '母音で終わる音節と、語末に e がある語は母音字を名前読み',
 'P3': '母音字が並ぶと 2 字で 1 つの母音',
 'P4': '母音 + r は r に引かれて別の音になる',
 'P5': '二重母音。語中か語末かで綴りを使い分ける',
 'P6': '強勢の無い音節は弱く曖昧になる',
}

# ---------- パターン表（番号つき）----------
# 綴り→音の規則を 1 行 1 パターンで持つ。番号は固定（並びを変えても振り直さない）。
# 末尾の黙字 e が音に関係しない綴り（ur_e = ur、oi_e = oi）は同じパターンにまとめる。
# (番号, 段階, 綴りの列, 音, いつその音になるか, 例語のヒント)
PATTERNS = [
 # 第1章 閉音節
 ( 1, 'P1', ['a'],            'æ',  '閉音節',                    'bat cat hat'),
 ( 2, 'P1', ['i'],            'ɪ',  '閉音節',                    'sit bit hit'),
 ( 3, 'P1', ['o'],            'ɑ',  '閉音節',                    'hot pot lot'),
 ( 4, 'P1', ['u'],            'ʌ',  '閉音節',                    'cut but nut'),
 ( 5, 'P1', ['e'],            'e',  '閉音節',                    'set bet get'),
 ( 6, 'P1', ['a'],            'ɑ',  'w・qu の後',                'want watch squat'),
 ( 7, 'P1', ['ea'],           'e',  '短い ea',                   'bread head dead'),
 ( 8, 'P1', ['y'],            'ɪ',  '語中の y（i の代わり）',     'gym myth system'),
 ( 9, 'P1', ['ui'],           'ɪ',  'qu の後の i',               'quit quick build'),
 # 第2章 開音節とマジック e
 (10, 'P2', ['a_e'],          'eɪ', 'マジック e',                'made cake name'),
 (11, 'P2', ['i_e'],          'aɪ', 'マジック e',                'ride time like'),
 (12, 'P2', ['o_e'],          'oʊ', 'マジック e',                'bone home note'),
 (13, 'P2', ['u_e'],          'uː', 'マジック e',                'rule tune June'),
 (14, 'P2', ['e_e'],          'iː', 'マジック e',                'these theme'),
 (15, 'P2', ['y_e'],          'aɪ', 'マジック e（y は i）',       'style type'),
 (16, 'P2', ['a'],            'eɪ', '開音節',                    'able baby paper'),
 (17, 'P2', ['i'],            'aɪ', '開音節・-ind -ild',          'mind kind child'),
 (18, 'P2', ['o'],            'oʊ', '開音節・-old',               'no go cold'),
 (19, 'P2', ['e'],            'iː', '開音節',                    'even evening'),
 (20, 'P2', ['u'],            'uː', '開音節',                    'flu duty ruby'),
 (21, 'P2', ['y'],            'aɪ', '1 音節語の語末',             'my by why'),
 # 第3章 母音チーム
 (22, 'P3', ['ee', 'ee_e'],   'iː', 'ee',                        'see feet sleeve'),
 (23, 'P3', ['ea', 'ea_e'],   'iː', 'ea',                        'seat leave please'),
 (24, 'P3', ['ai'],           'eɪ', '語中の ai',                  'rain main pain'),
 (25, 'P3', ['ay'],           'eɪ', '語末の ay',                  'day may pay'),
 (26, 'P3', ['oa'],           'oʊ', 'oa',                        'boat coat road'),
 (27, 'P3', ['ow'],           'oʊ', '語末・-own の ow',           'know show grow'),
 (28, 'P3', ['igh'],          'aɪ', 'igh（gh は黙字）',           'light night right'),
 (29, 'P3', ['ie', 'ie_e'],   'iː', 'ie',                        'field chief believe'),
 (30, 'P3', ['ie'],           'aɪ', '1 音節語の語末 ie',          'tie lie pie'),
 (31, 'P3', ['oo', 'oo_e'],   'uː', '長い oo',                    'pool food loose'),
 (32, 'P3', ['ew'],           'uː', 'ew',                        'crew grew threw'),
 (33, 'P3', ['ue'],           'uː', 'ue',                        'blue true glue'),
 (34, 'P3', ['ui', 'ui_e'],   'uː', 'ui',                        'suit fruit juice'),
 (35, 'P3', ['ou'],           'uː', 'ou（フランス語由来）',        'soup group youth'),
 (36, 'P3', ['oe'],           'oʊ', '語末の oe',                  'toe hoe foe'),
 (37, 'P3', ['eigh'],         'eɪ', 'eigh',                      'eight weight'),
 (38, 'P3', ['ey'],           'eɪ', '強い ey',                    'they grey obey'),
 (39, 'P3', ['ei'],           'eɪ', 'ei',                        'vein veil'),
 # 第4章 r 性母音
 (40, 'P4', ['ar', 'ar_e'],   'ɑr', 'ar',                        'car far large'),
 (41, 'P4', ['or', 'ore', 'or_e', 'oor', 'our_e'], 'ɔr', 'or・ore・oor', 'for more door'),
 (42, 'P4', ['er', 'ir', 'ur', 'er_e', 'ur_e'], 'ɝː', 'er・ir・ur（3 つとも同じ音）', 'her bird hurt'),
 (43, 'P4', ['ear'],          'ɝː', '子音の前の ear',             'learn earth search'),
 (44, 'P4', ['or', 'or_e'],   'ɝː', 'w の後の or',                'word work world'),
 (45, 'P4', ['ear'],          'ɪr', 'ear',                       'ear near fear'),
 (46, 'P4', ['eer', 'ere', 'ier_e'], 'ɪr', 'eer・ere',            'beer deer here'),
 (47, 'P4', ['air', 'are', 'err', 'er'], 'er', 'air・are、母音の前の er', 'air care berry very'),
 (48, 'P4', ['ear'],          'er', 'ear（少数派）',               'bear pear wear'),
 (49, 'P4', ['ar'],           'ɔr', 'w の後の ar',                'war warm warn'),
 # 第5章 二重母音とその他
 (50, 'P5', ['ou', 'ou_e'],   'aʊ', 'ou',                        'out loud house'),
 (51, 'P5', ['ow'],           'aʊ', 'ow',                        'now how cow'),
 (52, 'P5', ['oi', 'oi_e'],   'ɔɪ', '語中の oi',                  'oil boil noise'),
 (53, 'P5', ['oy'],           'ɔɪ', '語末の oy',                  'boy toy joy'),
 (54, 'P5', ['oo'],           'ʊ',  '短い oo',                    'book look good'),
 (55, 'P5', ['u'],            'ʊ',  'l・sh・p の後の u',           'pull push put'),
 (56, 'P5', ['aw'],           'ɔː', 'aw',                        'law saw draw'),
 (57, 'P5', ['au', 'au_e'],   'ɔː', 'au',                        'author cause pause'),
 (58, 'P5', ['a'],            'ɔː', 'l の前の a',                 'talk walk ball'),
 (59, 'P5', ['o'],            'ɔː', 'CLOTH 語（o でも /ɔː/）',    'boss loss dog off'),
 (60, 'P5', ['ough'],         'ɔː', 'ough',                      'thought bought'),
 (61, 'P5', ['augh'],         'ɔː', 'augh',                      'caught taught'),
 # 第6章 弱音節
 (62, 'P6', ['a'],            'ə',  '弱い音節の a',               'sofa about'),
 (63, 'P6', ['e'],            'ə',  '-en の e',                   'kitten listen'),
 (64, 'P6', ['le'],           'ə',  '子音 + le',                  'table apple'),
 (65, 'P6', ['o'],            'ə',  '-on の o',                   'lemon wagon'),
 (66, 'P6', ['ou'],           'ə',  '-ous',                      'famous nervous'),
 (67, 'P6', ['ai'],           'ə',  '-ain',                      'mountain captain'),
 (68, 'P6', ['i'],            'ə',  '-il の i',                   'pencil evil'),
 (69, 'P6', ['er'],           'ɚ',  '語末の -er',                 'hammer butter'),
 (70, 'P6', ['or', 'ar'],     'ɚ',  '語末の -or・-ar',            'doctor dollar'),
 (71, 'P6', ['y'],            'i',  '2 音節以上の語末 y',          'happy city'),
 (72, 'P6', ['ey'],           'i',  '語末の -ey',                 'valley monkey'),
]

# ---------- 例外表（番号つき）----------
# パターン表のどれにも当てはまらない (段階, 綴り, 音) の組。同じ組の語をまとめて 1 番号。
# (例外番号, 段階, 綴り, 音, ひとこと)
EXCEPTIONS = [
 ( 1, 'P1', 'o',    'ʌ',  'o なのに短い /ʌ/。u で書くべき音'),
 ( 2, 'P1', 'o_e',  'ʌ',  'o_e なのに /ʌ/（マジック e が効かない）'),
 ( 3, 'P2', 'o_e',  'uː', 'o_e なのに /uː/'),
 ( 4, 'P3', 'o',    'uː', 'o なのに /uː/'),
 ( 5, 'P5', 'o',    'ʊ',  'o なのに /ʊ/'),
 ( 6, 'P5', 'ou',   'ʊ',  'ou なのに /ʊ/（助動詞 3 つ）'),
 ( 7, 'P3', 'ea',   'eɪ', 'ea なのに /eɪ/'),
 ( 8, 'P4', 'er',   'ɪr', '母音の前の er が /ɪr/'),
 ( 9, 'P1', 'a',    'e',  'a なのに /e/'),
 (10, 'P4', 'ere',  'er', 'ere なのに /er/（here とは違う）'),
 (11, 'P6', 'a',    'ɚ',  '語頭の a + r が /ɚ/'),
 (12, 'P1', 'oo',   'ʌ',  'oo なのに /ʌ/'),
 (13, 'P1', 'al',   'ɑ',  'l を読まない al'),
 (14, 'P1', 'au',   'æ',  'au なのに /æ/'),
 (15, 'P3', 'oe',   'uː', 'oe なのに /uː/'),
 (16, 'P1', 'u',    'ɪ',  'u なのに /ɪ/'),
 (17, 'P1', 'o',    'ɪ',  'o なのに /ɪ/（women）'),
 (18, 'P1', 'e',    'ɪ',  'e なのに /ɪ/'),
 (19, 'P3', 'ai',   'aɪ', 'ai なのに /aɪ/'),
 (20, 'P4', 'ear',  'ɑr', 'ear なのに /ɑr/'),
 (21, 'P1', 'ya',   'ɑ',  'ch を読まない yacht'),
 (22, 'P1', 'oe',   'ʌ',  'oe なのに /ʌ/（does）'),
 (23, 'P1', 'i_e',  'ɪ',  'i_e なのに短い /ɪ/（give）'),
 (24, 'P1', 'ai',   'e',  'ai なのに /e/（said）'),
 (25, 'P1', 'ie',   'e',  'ie なのに /e/（friend）'),
 (26, 'P3', 'ei_e', 'iː', 'c の後の ei は /iː/'),
 (27, 'P3', 'ey',   'iː', 'ey なのに /iː/（key）'),
 (28, 'P3', 'wo',   'uː', 'w を読まない two'),
 (29, 'P3', 'uy',   'aɪ', 'uy（buy）'),
 (30, 'P3', 'eye',  'aɪ', 'eye'),
 (31, 'P3', 'ou',   'oʊ', 'ou なのに /oʊ/（soul）'),
 (32, 'P4', 'eir',  'ɪr', 'eir が /ɪr/（weird）'),
 (33, 'P4', 'eir',  'er', 'eir が /er/（their）'),
 (34, 'P5', 'o_e',  'ɔː', 'o_e なのに /ɔː/（gone）'),
 (35, 'P3', 'ou_e', 'uː', 'ou_e が /uː/（troupe）'),
]

def classify(entries):
    """全語にパターン番号か例外番号を付ける。どちらにも当てはまらなければ止める"""
    pmap = {}
    for num, st, gs, snd, cond, hint in PATTERNS:
        for g in gs:
            key = (st, g, snd)
            assert key not in pmap, f'パターン表で {key} が重複'
            pmap[key] = num
    emap = {}
    for num, st, g, snd, note in EXCEPTIONS:
        key = (st, g, snd)
        assert key not in emap and key not in pmap, f'例外表で {key} が重複、またはパターン表と衝突'
        emap[key] = num
    used_p, used_e, unknown = collections.Counter(), collections.Counter(), collections.defaultdict(list)
    for e in entries:
        key = (e['st'], e['g'], e['sound'])
        if key in pmap: e['pat'] = f'p{pmap[key]}'; e.pop('ex', None); used_p[pmap[key]] += 1
        elif key in emap: e['pat'] = f'e{emap[key]}'; e['ex'] = 1; used_e[emap[key]] += 1
        else: unknown[key].append(e['word'])
    assert not unknown, '番号の無い組（パターン表か例外表に足すこと）:\n  ' + '\n  '.join(f'{k}: {" ".join(v[:6])}' for k, v in unknown.items())
    dead_p = [n for n, *_ in PATTERNS if not used_p[n]]
    dead_e = [n for n, *_ in EXCEPTIONS if not used_e[n]]
    assert not dead_p and not dead_e, f'語が 1 つも無い番号: パターン {dead_p} 例外 {dead_e}'
    nums = [n for n, *_ in PATTERNS]; assert len(nums) == len(set(nums)), 'パターン番号が重複'
    nums = [n for n, *_ in EXCEPTIONS]; assert len(nums) == len(set(nums)), '例外番号が重複'
    print(f'パターン {len(PATTERNS)} 個（{sum(used_p.values())} 語）、例外 {len(EXCEPTIONS)} 個（{sum(used_e.values())} 語 / {sum(used_e.values()) / len(entries) * 100:.1f}%）')
    pats = [{"id": f'p{n}', "n": n, "st": st, "g": gs, "sound": snd, "cond": cond, "hint": hint, "count": used_p[n]}
            for n, st, gs, snd, cond, hint in PATTERNS]
    exs = [{"id": f'e{n}', "n": n, "st": st, "g": g, "sound": snd, "note": note, "count": used_e[n],
            "words": sorted([e['word'] for e in entries if e.get('pat') == f'e{n}'], key=str.lower)}
           for n, st, g, snd, note in EXCEPTIONS]
    return pats, exs

# 段階×綴りの一行ルールは、パターン表から作る（文章を別に持って食い違わせない）
def rule_for(st, g):
    parts = [f'{cond} → /{snd}/' for n, s2, gs, snd, cond, hint in PATTERNS if s2 == st and g in gs]
    return '、'.join(parts) if parts else SRULE[st]

def check_rules(entries):
    miss = sorted({s for e in entries for s in [e['sound']] if s not in MOUTH})
    assert not miss, f'口の作り方が無い音: {miss}'
    print(f'口の作り方 {len(MOUTH)} 音')

# ---------- 集約 ----------
sets = [
    {"id": "d01", "itemId": "v01", "title": "/ɑ/ /æ/ /ʌ/", "sounds": ["ɑ", "æ", "ʌ"], "examples": {"ɑ": "body", "æ": "bat", "ʌ": "but"}, "hint": "『英語耳』の body / bat / but。顎の開き方（大・横・小）で分ける。/ʌ/ は綴りに注意"},
    {"id": "d02", "itemId": "v02", "title": "/iː/ /ɪ/ /e/", "sounds": ["iː", "ɪ", "e"], "hint": "舌の高さ（高・中高・中）"},
    {"id": "d03", "itemId": "v03", "title": "/uː/ /ʊ/", "sounds": ["uː", "ʊ"], "hint": "唇の緊張（強・弱）。oo は両方あり得る"},
    {"id": "d04", "itemId": "v04", "title": "/aɪ/ /eɪ/ /ɔɪ/", "sounds": ["aɪ", "eɪ", "ɔɪ"], "hint": "出発点の口（ア・エ・オ）"},
    {"id": "d05", "itemId": "v05", "title": "/aʊ/ /oʊ/", "sounds": ["aʊ", "oʊ"], "hint": "出発点の開き（大・中）"},
    {"id": "d06", "itemId": "v06", "title": "/ɔː/ /ɑ/", "sounds": ["ɔː", "ɑ"], "hint": "唇の丸め。merger 地域では区別しないので参考程度に"},
    {"id": "d07", "itemId": "v07", "title": "/ɝː/ /ɑr/ /ɔr/", "sounds": ["ɝː", "ɑr", "ɔr"], "hint": "R の前の母音（無・ア・オ）"},
    {"id": "d08", "itemId": "v07", "title": "/ɪr/ /er/ /ɑr/", "sounds": ["ɪr", "er", "ɑr"], "hint": "ear / air / are"},
    {"id": "d09", "itemId": "v02", "title": "/iː/ /ɪ/", "sounds": ["iː", "ɪ"], "hint": "2択で速さ重視"},
    {"id": "d10", "itemId": "v01", "title": "/æ/ /ʌ/", "sounds": ["æ", "ʌ"], "examples": {"æ": "bat", "ʌ": "but"}, "hint": "bat / but。2択で速さ重視"},
]
CMU = load_cmu(CMU_PATH)
words = []
seen = collections.defaultdict(set)
for s, lst in W.items():
    for w, note in lst:
        if w in seen[s]: continue
        seen[s].add(w)
        e = {"word": w, "sound": s}
        hl = highlight(w, s)
        if hl:
            e["hl"] = hl
            e["g"] = grapheme(w, hl)
            e["st"] = stage(e["g"], s)
        else: print("no highlight:", w, s)
        if note: e["note"] = note
        words.append(e)
# 強勢母音の語は 1 語 1 音（live / bow のような二通りに読める語を弾く）
by_sound = collections.defaultdict(set)
for e in words: by_sound[e["word"]].add(e["sound"])
dups = {w: s for w, s in by_sound.items() if len(s) > 1}
assert not dups, f"重複: {dups}"

# 弱音節を追加。同じ語でも赤字にする位置が違えば別問題として持ち、記録キー k を分ける
by_word = collections.defaultdict(list)
for e in words: by_word[e["word"]].append(e)
overlaps = []
for e in build_weak():
    prev = by_word[e["word"]]
    hit = [q for q in prev if e["hl"][0] < q["hl"][1] and q["hl"][0] < e["hl"][1]]
    if hit:
        overlaps.append(f'{e["word"]}: 弱音節 {e["hl"]} が強勢母音 {hit[0]["hl"]} と重なる'
                        f'（{e["word"][hit[0]["hl"][0]:hit[0]["hl"][1]]} を {hit[0]["sound"]} として登録済み）')
        continue
    if prev: e["k"] = f'{e["word"]}#{e["hl"][0]}'
    prev.append(e); words.append(e)
assert not overlaps, '赤字位置が衝突（OVERRIDE で強勢母音の位置を直すこと）:\n  ' + '\n  '.join(overlaps)
pairs = [(e["word"], tuple(e["hl"])) for e in words]
assert len(pairs) == len(set(pairs)), f'同じ語・同じ位置の重複: {[x for x, n in collections.Counter(pairs).items() if n > 1]}'

verify(words)
EIGO = build_eigo()
LESSON_DATA = build_lessons()
GSOUNDS = build_gsounds(words)
check_rules(words)
PATTERN_DATA, EXCEPTION_DATA = classify(words)
for e in words:   # 「綴り o だが /ʌ/」のような注記は例外の表示と重なるので落とす
    if e.get('ex') and re.fullmatch(r'綴り \S+ だが /\S+/', e.get('note') or ''): del e['note']
EXGROUPS = {f"{x['st']}|{x['g']}|{x['sound']}": x['words'] for x in EXCEPTION_DATA}
COURSE = build_course(words)
RULES = {f'{st}|{g}': rule_for(st, g) for st, g in {(e['st'], e['g']) for e in words}}
print("フォニックス・コース:")
check_course(COURSE, words)
out = {"version": 8, "course": COURSE, "neighbors": NEIGHBORS, "exGroups": EXGROUPS,
       "patterns": PATTERN_DATA, "exceptions": EXCEPTION_DATA,
       "lessons": LESSON_DATA, "noLesson": NO_LESSON,
       "mouth": MOUTH, "rules": RULES,
       "eigo": EIGO, "eigoGroups": EIGO_GROUPS, "gsounds": GSOUNDS,
       "note": "大量ドリル用の単語バンク。sound は強勢母音。note は方言差・綴り例外。sets はドリルの組み合わせ。tests/build-drill-words.py で生成。",
       "sets": sets, "words": words}
json.dump(out, open('data/drill-words.json', 'w'), ensure_ascii=False, indent=1)
cnt = collections.Counter(e["sound"] for e in words)
print(len(words), dict(cnt))
