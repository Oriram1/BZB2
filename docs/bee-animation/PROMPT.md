# אנימציית הדבורה ליד תיבת הבוט

אותה שיטה כמו קופוני (`coupon_manager_project_react_native/assets/mascot`):
1. כלי התמונה מייצר **גיליון keyframes**: 6 פוזות, 3×2, רקע ירוק כרומה, מצלמה קבועה.
2. סקריפט מסיר את הירוק, מיישר את הפוזות ומייצר פריימי ביניים.
3. יוצא אטלס `webp` שקוף (36 פריימים, 6×6), שהאתר מנגן כ-sprite.

## רפרנסים (לצרף לכלי התמונה)

| קובץ | תפקיד |
|---|---|
| `references/bee-basic.png` | **הרפרנס הראשי** — הדבורה של האפליקציה. זהות, צבע, חומר, פרופורציות |
| `references/bee-chef.png`, `references/bee-gardener-f.png` | אותה דבורה בתחפושת — רק כדי להראות לכלי מה קבוע בדמות. **לא** להעתיק תחפושת |
| `references/bzb-logo.jpg` | צבעי המותג (צהוב `#F5B927`, שחור `#1F2018`). לא לצייר את הלוגו |

## שני מצבים

- **idle** — מרחפת ליד התיבה ומחכה שיכתבו. לופ.
- **thinking** — בזמן "ממלא את הטופס…". לופ.

תצוגה באתר: 56–72px. לכן תנועה גדולה וברורה, בלי פרטים זעירים.

---

## פרומפט 1 — idle (להדביק כמו שהוא)

> Create a production animation keyframe sheet for a web app mascot, matching
> the attached reference character (reference 1, bee-basic) with maximum
> fidelity: a chubby round yellow bee with two dark brown-black stripes across
> the back, a glossy soft 3D vinyl material, large friendly dark eyes with white
> highlights and small eyelashes, soft pink cheeks, a small curved smile, two
> thin black antennae with round tips, four thin dark legs, and two translucent
> pale grey-white wings. Same proportions, same colours, same soft top-left
> lighting. References 2 and 3 show the same bee in costumes only to show which
> features are fixed — do NOT add any costume, hat, prop or clothing. No
> redesign, no recolouring, no extra limbs.
>
> Output a single PNG, exactly 1536x1024, laid out as 3 columns by 2 rows of
> 512x512 cells, on a flat pure chroma-green (#00FF00) background. Fixed
> camera: the bee is the same size in all six cells, full body, three-quarter
> front view facing slightly to the viewer's right, centred with at least 15%
> empty margin on every side.
>
> The six cells are one gentle hovering loop. Cell 1: body at mid height, wings
> fully up, antennae relaxed. Cell 2: body slightly higher, wings level, antennae
> tilting back a little. Cell 3: body at highest point, wings fully down, eyes
> open, smile. Cell 4: body slightly lower, wings level, antennae bouncing
> forward. Cell 5: body at lowest point, wings fully up, eyes in a happy blink
> (closed curved lids). Cell 6: almost the same as cell 1 so the loop closes.
> Total vertical travel is small, about 6% of the cell height. The legs dangle
> loosely and sway slightly with the motion.
>
> Keep the motion between neighbouring cells small. Wings must stay attached at
> the same point on the back in every cell. No text, no labels, no cell borders,
> no backdrop, no motion lines, no sparkles, no shadow on the background.

## פרומפט 2 — thinking

> Same character, same rules, same 1536x1024 sheet of 3x2 cells of 512x512 on a
> flat pure chroma-green (#00FF00) background, same fixed camera, size and
> position as the attached idle sheet (attach it as reference 4).
>
> The six cells are one "thinking / working on it" loop. The bee hovers in
> place with fast wings and looks up and to the side, thinking. Cell 1: eyes
> looking up-left, one front leg raised and touching the chin, wings up. Cell 2:
> eyes up-left, wings level, antennae leaning left. Cell 3: eyes up-right,
> wings down, antennae leaning right, small "o" mouth. Cell 4: eyes up-right,
> wings level, antennae straight. Cell 5: eyes back to front, a small satisfied
> smile, wings up. Cell 6: almost the same as cell 1 so the loop closes.
> Body position moves very little; the story is in the eyes, antennae and the
> leg at the chin.
>
> No text, no question marks, no thought bubbles, no labels, no cell borders,
> no sparkles, no shadow on the background.

---

## מה לבדוק כשהגיליון חוזר

1. 6 פוזות, אותו גודל דבורה בכל התאים. אם אחת גדולה או קטנה — לבקש מחדש.
2. הכנפיים מחוברות באותה נקודה בכל תא, בלי כנף שלישית.
3. הפסים, הלחיים והריסים נשארו. אין כובע או חפץ.
4. הירוק נקי ואחיד, בלי צל ובלי מעבר צבע.
5. הקובץ נפתח עד הסוף (בקופוני הגיעו פעם גיליונות קטועים).

לשמור כ-`docs/bee-animation/source/idle-keyframes.png` ו-`thinking-keyframes.png`,
ואז אני אכין את האטלס ואחבר אותו ליד התיבה.
