# Print output audit: logos, colour, black and white, text and page layout

Date: 15 October 2026. Code at commit `e77a3f5` (v0.11.1). Nothing in `src/` was changed.

## How this was done

- Four independent read-only reviews, one each for: the logo pipeline, colour and contrast, text and fonts, and page layout with print paths.
- Real sample printouts made with the app's own code. Six made-up logos and four made-up school colour schemes went through the real logo preparer (`prepareLogo`), label builder and letter builder. The pages were rendered in Chromium, then turned to greyscale the way a black-and-white printer would see them. The images are in `2026-10-15-print-samples/`. All names and logos in them are synthetic.
- Every High finding below was either seen in the sample printouts or rerun by hand against the code.

Severity:
- **High**: a school using the app normally will print something wrong, blank or unreadable, or the print will fail.
- **Medium**: a plausible case goes wrong.
- **Low**: an edge case or cosmetic.

## Summary

The label and letter geometry is sound. Text measuring for English names is accurate to 0.1 mm. Mono letters are high contrast throughout. Dark mode, text-size zoom and high contrast do not leak into printouts.

The problems cluster in three places:

1. **The one-colour logo maker** (`src/shared/logo.ts`) still has three ways to print a blank or a black block. One of them was introduced by the 13 October fix.
2. **The school's main colour** is used for white heading text and for coloured headings with no contrast check. Gold, yellow, orange and sky blue schools get unreadable letters, worse on a black-and-white printer.
3. **The logo is copied into every label and every letter.** With a large logo this makes pages of hundreds of megabytes, and at about 2 MB a full set fails outright. The 13 October fix doubled the one-colour logo's width and height, so each copy is about four times bigger.

## High

### H1. Pale logos print as nothing on one-colour labels and letters

- **What happens:** a gold, yellow, orange, sky-blue or light-grey logo on a see-through background comes out completely blank. A logo on a mid-tone solid background (sky blue, orange) also comes out blank. No warning shows.
- **Seen in:** `contact-labels-mono.png` (gold and pale-blue rows) and `contact-letters-mono.png` (navy-gold and sky-paleBlue rows).
- **Why:** every pixel with a brightness of 0.6 or more turns white (`src/shared/logo.ts:90`). Gold is 0.79, orange 0.61 and sky blue 0.63. Only pixels above 0.85 can be darkened (`logo.ts:80`), and the "vanishes on white" warning only counts pixels above 0.85 (`logo.ts:32`).
- **Fix:** when almost no visible pixel would print black, choose the cut-off from the picture's own spread of light and dark, or fall back to a solid shape. Warn when the result is over about 98% one colour.

### H2. A logo on a white card or rounded square prints as a black block, or with black corners

This is the "solid black shape" bug again, in a new form.

- **White card with clear space around it:** the darkening step spreads from the clear space into the whole white card. The card prints solid black and the dark crest disappears into it. Confirmed: 64% of the picture black (`white-card-logos-mono.png`, right). The upload warning does fire, but it reads "A dark version has been made… check it below", which sounds like success.
- **Rounded square, or a thin clear margin (under 5% see-through):** the logo counts as having its own background. Every pixel is forced to fully solid (`logo.ts:94`). Clear pixels read as black, so the corners or margin print as black wedges or a black frame. Confirmed: the corner pixel is solid black (`white-card-logos-mono.png`, left).
- **How common:** logos exported from Canva or a website often come as a white rounded tile or a white card with padding.
- **Fix:**
  1. Never turn a clear pixel solid. Keep it clear, or make it white.
  2. When a near-white area that touches the clear background encloses darker artwork, treat that area as background, not lettering.

### H3. Schools that set their logo before v0.11.1 keep the old black silhouette, and nothing tells them

- The one-colour logo is made once, in the window, when the logo is chosen (`src/renderer/src/settings/SchoolForm.tsx:69-81`). It is stored, and never made again.
- The instruction "Pick your logo again with Replace logo…" exists only in the body of the commit message. Release notes are built from commit subjects only (`.github/workflows/release.yml:248`), so staff never see it. The user guide does not mention it.
- **Fix:** when a file opens and its one-colour logo is solid black wherever it is not clear, remake it from the stored colour logo. Or offer to remake it. Also put the re-pick step in the next release notes.

### H4. The logo is copied into every label and every letter, so big jobs get slow or fail

- **Labels:** each label carries its own full copy of the logo (`src/main/render/labelSheet.ts:67-75`).
- **Letters:** each letter header carries its own copy (`src/main/render/letter.ts:248-249`). Letter pictures are already done the right way: once per document (`letter.ts:104-109`).
- **Measured:** the sample one-colour logos are about 190 KB per label. A full set of 228 labels is therefore about 43 MB of page before printing starts.
- **Where it breaks:** a 2 MB logo (the upload limit) on 228 colour labels makes about 620 MB of page. That is over the largest text the app's JavaScript engine can hold (about 537 million characters), so the job stops with an error. Letters reach the same limit at about 1,500 copies with a logo of about 270 KB.
- **It makes the screen slow too:** the label designer rebuilds the page for every locker, 150 ms after each drag or resize, to show one label (`src/renderer/src/settings/LabelsForm.tsx:350-363`).
- **Letters do this twice:** the overflow check and the direct-print route build the whole letters document even though the PDF route works 25 letters at a time (`src/main/render/prepareLetters.ts:86`, `src/main/documentService.ts:206-212, 253`).
- **Fix:**
  1. Put the logo once in the page's style sheet, as pictures already are.
  2. Have the designer build one sheet only.
- **Not proven:** whether Chromium shrinks the 2048-pixel logo inside the PDF, which would undo the "crisp edges" aim. One check with `pdfimages -list` on a real labels PDF would settle it.

### H5. Colour letters for gold, yellow, orange or sky-blue schools are hard to read, and worse on a black-and-white printer

- **The heading band:** "Your locker", the school name and the sub-line are always white on the main colour (`letter.ts:118`). The school name and sub-line are also faded to 90% (`letter.ts:120, 122`).
- **The headings:** "Know your lock" and the other section headings print in the main colour (`letter.ts:136`). So do the small "LOCKER" and "YOUR CODE" words (`letter.ts:130`).
- **The minimum:** contrast should be at least 3 to 1 for large text and 4.5 to 1 for small text (WCAG, the web accessibility guidelines).

| Main colour | White text on the band |
|---|---|
| Gold #FFD700 | 1.4 to 1 |
| Sky blue #87CEEB | 1.7 to 1 |
| Orange #FF8C00 | 2.3 to 1 |
| Default navy #1F3A5F | 11.5 to 1 |

- **On a black-and-white printer:** a gold band becomes very light grey, so the white title nearly vanishes. Gold headings become pale grey. Seen in `contact-letters-colour.png`, the gold and sky rows, right-hand side.
- **No check, no advice:**
  - Settings accepts any colour (`src/main/repos/school.ts:63`).
  - The letter's Colour or Black and white option gives no advice (`src/renderer/src/settings/LettersForm.tsx:566-574`). Labels at least say "One colour (black-and-white printers)".
- **What stays readable:** the locker number and code digits always print dark.
- **Fix:**
  1. Choose black or white band text, whichever contrasts more with the main colour.
  2. Darken the main colour wherever it is used for text, until it reaches 4.5 to 1.
  3. Warn in Settings, School when the colour is too pale.
  4. Add "Choose Black and white if your printer has no colour" under the letter option.

### H6. On colour letters, a logo in the school's own colour disappears into the heading band

- **The cause:** colour letters put the colour logo straight onto the band of the main colour (`letter.ts:118, 249`; `src/main/repos/letters.ts:346`). The main colour is usually the crest's own colour.
- **The effect:** a navy crest on a navy band leaves only its white parts showing (`contact-letters-colour.png`, navy-crestWhiteText row). A red crest on maroon is faint. A JPEG logo prints as a white square on the band.
- **Not visible beforehand:** the band preview in Settings, Colours does not show the logo (`SchoolForm.tsx:188-205`).
- **Fix:**
  1. Show the logo in that preview.
  2. Either put the logo on a white rounded tile inside the band on purpose, or warn when the logo's colour is close to the band's.

## Medium

### M1. Label text other than the name is cut off without warning, and right-aligned text loses its start

- **The cause:** only the name is reported as too long (`labelSheet.ts:88, 95`). The group, year level, locker number, area, bank and custom text are cut off silently (`labelSheet.ts:99-133, 148`).
- **Right-aligned text** (the locker number) is cut from the front. With the term "Learning Community Locker", label 1000 printed "MMUNITY LOCKER 1000".
- **Fix:** report every element that does not fit, and keep the start of overflowing text.

### M2. Right-to-left letters (Arabic, Persian, Dari) are laid out left to right, and `{code}` in the words can print backwards

- **Layout:** every letter is marked as English, left to right (`letter.ts:299`), so bullets and full stops land on the wrong side.
- **The code:** the `{code}` merge value is the digits with spaces (`letter.ts:153-158`). Inside right-to-left text, code 1234 prints as "4 3 2 1" read left to right. The code boxes in the student panel are correct; only a code typed into the words is affected.
- **Fix:**
  1. Set `lang` and `dir` on each letter from its language.
  2. Isolate each merge value so it keeps its own direction.

### M3. Numbered steps with blank lines between them all print as "1."

- Each paragraph becomes its own list and the typed number is dropped (`src/main/letters/text.ts:32-48`).
- **Fix:** keep the typed number.

### M4. The bundled font covers only Latin letters, so other names are measured wrongly and look different on Mac and Windows

- **What is shipped:** only the Latin and Latin Extended parts of Arimo (`src/main/render/fonts.ts:11-19`).
- **Missing:** part of Vietnamese (ạ ả ầ ễ ặ ị), Greek, Cyrillic, Hebrew, Arabic, Persian, Chinese, Japanese, Korean, Burmese and Karen, Hindi, Punjabi, Tamil and emoji. These fall back to whatever fonts the computer has. Seen in `label-names-other-scripts.png`.
- **Covered:** Māori macrons, Polish, Czech, Turkish, Somali and Dinka are all fine.
- **Effect on fitting:**
  - Most fallback names print smaller than they need to. A Cyrillic name prints at about 77% of the width it was given.
  - Chinese, Japanese and Korean are measured too narrow. A long name in those scripts, or a name with an emoji, can pass the check and still be cut off.
- **Effect across computers:** the same file prints with different fonts on a Mac and on a Windows PC.
- **Fix:** bundle the full Arimo font (it adds Vietnamese, Greek, Cyrillic and Hebrew). For anything else, measure at a safe wide width, or measure inside Chromium.

### M5. A white logo vanishes on colour labels

- **The cause:** colour labels use the colour logo (`labelSheet.ts:69-71`). A white logo made for dark backgrounds prints white on white (`contact-labels-colour.png`, allWhite row).
- **Why staff are not warned:** the upload warning is shown once and not kept. The label Colour option gives no hint.
- **Fix:** keep the "vanishes on white" result, and have colour labels use the one-colour logo when it is set.

### M6. Wide logos print as an unreadable strip

- **The effect:** a crest with the school name beside it, at 5 to 1, prints about 22 x 4.4 mm in the label's logo box (`src/main/render/layout.ts:26`). The school name is then about 1 mm tall. The letter header box is a 24 mm square (`letter.ts:119`), so letters have the same problem.
- **Fix:** warn when a logo is wider than about 2.5 to 1, and suggest using the crest on its own.

### M7. Print… and Save as PDF take different routes, and the "Actual size" advice may not match the dialog

- **The difference:** Print… sends a custom page size to the system print dialog (`src/main/render/pdf.ts:75-98`).
- **The risk:** on a Windows PC whose printer defaults to US Letter, the driver may override the page size. That could cut off the bottom row of an A4 label sheet, or shrink it to 94%, which moves the bottom row about 14 mm.
- **The advice:** the on-screen advice says "Actual size (or 100%)". That option belongs to PDF viewers; the Windows print dialog does not have it.
- **No test covers direct printing.**
- **Fix:** test Print… on a Windows PC set to Letter. If it misbehaves, have Print… print the saved PDF instead. Add "Paper size A4" to the advice.

### M8. The printer nudge is forgotten and is not tied to the printer

- **Forgotten:** the nudge resets to "None" every time the Print screen opens (`src/renderer/src/print/PrintLabelsScreen.tsx:29, 203`).
- **Hidden in saved PDFs:** a saved PDF has the chosen printer's nudge built in, and its file name gives no sign of it.
- **Fix:**
  1. Remember the last nudge on each computer.
  2. Put the nudge name in the PDF file name.

### M9. The calibration page's ruler marks sit where lasers cannot print

- **The cause:** ticks start at the paper edge and are 2 to 5 mm long (`src/main/render/calibration.ts:10-33`). Most lasers leave 4 to 5 mm blank at the edge, so most ticks never print.
- **Why it matters:** the guide tells staff to "Read the rulers".
- **Fix:** move the rulers about 6 mm in from the edge.

### M10. QR codes are too small when first added, and the link cannot be opened by a phone

- **Too small:** the designer adds a 20 x 6 mm QR box, so each square of the code is 0.21 mm. Phones need about 0.33 to 0.4 mm. The code has no blank border, though a QR code needs one four squares wide (`src/main/render/qr.ts:13`).
- **Cannot be opened:** the code holds `lockermanager://locker/…`, which a phone camera cannot open. A USB scanner types it as text, and quick find does not accept that text.
- **Fix:**
  1. Set a minimum size of about 12 mm, with the border built in.
  2. Accept a typed or pasted link in quick find.

## Low

- **One-colour logo maker:** light lettering with a thin opaque grey edge stays white and vanishes. This is the same root cause as H1.
- **Colour and one-colour logos out of step:** if the second of the two upload calls fails, the new colour logo sits beside the old one-colour logo (`SchoolForm.tsx:73-74`). Each upload also makes two undo steps.
- **Small logos print blurry:** a 100-pixel colour logo prints at about 110 dots per inch, with no warning.
- **Letter name box:** the name is fitted to a fixed 108 mm (`letter.ts:60`), but the real space is 68 to 80 mm. Long names wrap more than expected and can run into the lock column. The page check still holds.
- **Turkish capitals:** CSS capitals under the English language setting print "ŞIFRE", not "ŞİFRE". Name case turns "İSMAİL" into "İsmai̇l" with a stray dot (`nameCase.ts:48`).
- **Report headings:** a long single word runs over the next heading (`src/main/render/report.ts:80`: `th` has no word-wrap).
- **Faint report lines:** table row lines are 0.2 mm at light grey (`report.ts:81`), and toner-save printers may drop them. The calibration page's dashed safe-edge line has the same risk.
- **Stripes in greyscale:** red and green stripes become the same grey and merge. This is cosmetic.
- **Reports printed directly** get Chromium's own header and footer, not the PDF's "Page X of Y". A long footer may be shortened, which could cut off "CONFIDENTIAL".
- **Edge and nudge checks:** nudges and custom sheets are not checked against the printer's unprintable edge (`src/shared/labelGeometry.ts:16-30`).
- **Preview:** it leaves out the printer nudge, but the guide says it is "exactly as it will print".
- **Text-size zoom:** the zoom is also applied to the hidden print windows (`src/main/computerService.ts:61-63`). It does not change output today, but that is fragile.
- **Direct printing of many letters:** after the checks, the whole job goes to the dialog in one go, with no progress bar and no Cancel.

## Checked and fine

- Label positions are worked out fresh for each label, so rounding errors do not add up. Every built-in stock keeps content at least 6 mm from the paper edge.
- Backgrounds print on every route. Every page sets `print-color-adjust: exact`, and saved PDFs keep their fills.
- Dark mode, text-size zoom and high contrast do not change printouts. This was tested: the PDFs were pixel-identical.
- One-colour letters are black on white throughout. Labels print text in black in both modes. Nothing is shown by colour alone.
- Logo edges are smooth with no halo, and a white motto inside a dark crest is kept.
- The file-type and 2 MB limits are clear. SVG logos cannot run scripts.
- Merge fields and names are escaped once, so markup in a name does nothing.
- Letter overflow is measured on exactly the HTML that prints, with real codes, and printing stops with the students' names if a letter overflows. The PDF page count is checked.
- Report headers repeat on every page, rows do not split across pages, and the footer clears the last row.
- QR codes are vector drawings and always black on white.

## Not covered by any test

- Direct printing of labels, letters and reports.
- Colour label templates.
- The one-colour logo inside a real PDF.
- QR codes on a printed sheet.
- Any label stock other than L7163, including the US Letter stocks.
- The bottom row and last sheet of labels.
- Letter layout in either colour mode (only page counts are checked).
- Report contents.

The golden image is a screenshot of the on-screen preview, on macOS only. It is not the PDF.

## Checks only Dave can do

1. On the Windows PC, print one label sheet with Print… while the printer is set to Letter. Measure the bottom row.
2. Print a colour letter on a black-and-white printer, using a pale main colour.
3. Run `pdfimages -list` on a saved labels PDF. It shows whether the logo is kept at full resolution.

## Suggested order of work

1. Logo maker: H1, H2 and the Low item about grey edges together, with unit tests for each logo shape in this report.
2. Remake the one-colour logo for old files, and fix the release notes (H3).
3. Put the logo once per page, and make the designer build one sheet only (H4).
4. Letter colours: band text, heading colour, warnings and the logo on the band (H5 and H6).
5. Silent cut-off on labels, right-to-left letters and numbered lists (M1 to M3).
6. The full font (M4).
7. Printing route, nudge, calibration and QR (M7 to M10), after the Windows check.

## Fixes (15 October 2026, branch `print-audit-fixes`)

Dave chose: a white tile behind the letter logo only when it would vanish; pale school colours adjusted automatically; Print… always sends A4 by name (US Letter stocks send Letter).

| Item | Status | Commit |
|---|---|---|
| H1 pale logos blank | Fixed: the cut-off adapts to the logo's own light and dark | `6a66ec5` |
| H2 white card, rounded tile | Fixed: see-through stays see-through; a card enclosing the artwork stays white | `6a66ec5` |
| H3 old one-colour logos | Fixed: Home and Settings, School offer "Remake your one-colour logo". The release notes carry it in the commit subject | `6a66ec5` |
| H4 logo copied per label and letter | Fixed: once per page; the designer asks for one label | `efb009e` |
| H5 pale school colours | Fixed: black band words when they read better; headings darkened to 4.5 to 1; note in Settings; letter Colour hint | `6f8318e` |
| H6 logo vanishes into the band | Fixed: white tile when the logo is opaque, close to the band colour, or has white lettering on a pale band | `6f8318e` |
| M1 label words cut off silently | Fixed: reported on the Print screen, start kept | `564a1ab` |
| M2 right-to-left letters | Fixed: `lang` and `dir` per letter; merge values isolated; code boxes always left to right | `564a1ab` |
| M3 numbered steps | Fixed: `<ol start>` | `564a1ab` |
| M4 fonts | Fixed: full Arimo (Vietnamese, Greek, Cyrillic, Hebrew); other scripts measured at 1 em | `0bc37ed` |
| M5 white logo on colour labels | Fixed: uses the one-colour version | `9e5dac0` |
| M6 wide logos, L small logos | Fixed: lasting warnings in Settings, School (from the logo facts) | `6a66ec5` |
| M7 Print… paper size | Fixed in code: named A4 or Letter, advice updated. **Not proven on a real Windows printer.** | `ee1d649` |
| M8 nudge | Fixed: remembered per computer; named in the PDF file name | `ee1d649` |
| M9 calibration rulers | Fixed: start 6 mm in, still count from the paper edge | `ee1d649` |
| M10 QR codes | Fixed: 4-square border, 14 mm default, warning under 12 mm, quick find reads the link | `ee1d649` |
| Low items | Fixed: letter name width, report heading wrap and lines, CONFIDENTIAL first, paper-edge warning, Turkish İ, fonts.ready, zoom, guide wording | `bd1cd75` |

Left as they are, on purpose:
- Two dark colours in one crest (red and green) both print black in the one-colour logo. Schools can choose their own one-colour file.
- The CONFIDENTIAL watermark stays faint; the red banner and footer carry the warning.
- Stripes that print the same grey, and the letter band printing to the paper edge, are cosmetic.
- Letter pictures are not converted for black-and-white letters; the printer's greys suit photos better.
- An SVG with no size of its own (L3) was not proven to misbehave; not changed.
- Printing many letters straight to a printer still has no progress bar after the checks. The page is now far smaller (the logo is in it once), so it loads much faster.
