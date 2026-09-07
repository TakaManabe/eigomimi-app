# data/drill-words.json を生成するスクリプト（単語は人手で選定。実行: python3 tests/build-drill-words.py）
# 方針: 強勢母音が明確な語を優先。cot–caught merger など方言差のある語は note を付ける。
import json, collections

W = {}   # sound -> [(word, note)]
def add(sound, words, note=None):
    for w in words.split():
        W.setdefault(sound, []).append((w.replace('_', ' '), note))

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

# ---------- 強調範囲（その音に対応する綴り）の推定 ----------
import re
PATTERNS = {
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
 'idea': (0, 1), 'forest': (1, 3), 'two': (1, 3), 'eye': (0, 3), 'who': (2, 3), 'shoe': (2, 4),
}
def highlight(word, sound):
    if word in OVERRIDE: return list(OVERRIDE[word])
    for pat in PATTERNS.get(sound, []):
        m = re.search(pat, word, re.I)
        if m: return [m.start(), m.end()]
    return None

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
words = []
seen = collections.defaultdict(set)
for s, lst in W.items():
    for w, note in lst:
        if w in seen[s]: continue
        seen[s].add(w)
        e = {"word": w, "sound": s}
        hl = highlight(w, s)
        if hl: e["hl"] = hl
        else: print("no highlight:", w, s)
        if note: e["note"] = note
        words.append(e)
# 同じ語が複数音に登録されていないか
by_word = collections.defaultdict(set)
for e in words: by_word[e["word"]].add(e["sound"])
dups = {w: s for w, s in by_word.items() if len(s) > 1}
assert not dups, f"重複: {dups}"
out = {"version": 1,
       "note": "大量ドリル用の単語バンク。sound は強勢母音。note は方言差・綴り例外。sets はドリルの組み合わせ。tests/build-drill-words.py で生成。",
       "sets": sets, "words": words}
json.dump(out, open('data/drill-words.json', 'w'), ensure_ascii=False, indent=1)
cnt = collections.Counter(e["sound"] for e in words)
print(len(words), dict(cnt))
