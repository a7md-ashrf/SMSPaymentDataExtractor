# Payment Screenshot Extractor

Extract payment details from Arabic/English SMS screenshots and app receipts,
locally. No cloud OCR, no API keys.

[English](#english) · [العربية](#العربية)

---

## English

### What it does

The project reads a screenshot with Tesseract OCR, splits the recognized text
into separate messages, and parses every payment it finds. A single screenshot
can contain two SMS messages, so returning only the first one would miss the
transaction the user usually needs.

Typical output fields:

- provider, channel, direction and status
- amount, currency, fee, total and balance
- sender and recipient names / wallets / accounts
- date and time in a normalized format
- transaction ID or reference number
- missing-field warnings

The repository does **not** include screenshots. The `public/` directory is a
local-only workspace for your own images and is ignored by Git.

### Quick start

```bash
bun install

# Process all local images in ./public (if it exists)
bun run dev

# Process specific images
bun run scripts/extract-payments.ts ./receipt.png ./another.jpg

# See only the raw OCR text
bun run scripts/ocr-image.ts ./receipt.png

# Parse text that was already recognized
bun run scripts/parse-text.ts ./sample.txt
cat ./sample.txt | bun run scripts/parse-text.ts

# Check every local screenshot for consistency
bun run scripts/check-public-images.ts

# Tests and type checking
bun run test
bun run test:unit
bun run test:integration
bun run typecheck
```

The extraction command writes a JSON array to stdout. Progress summaries and
errors go to stderr, so stdout remains valid JSON.

### What if `public/` is missing?

Nothing breaks. `public/` is optional and may be deleted completely before
sharing the project.

- `bun run dev` prints "No images found" to stderr, outputs `[]` on stdout,
  and exits cleanly.
- `bun run scripts/check-public-images.ts` reports that there is nothing to
  check.
- OCR integration tests are skipped automatically.
- Parser and CLI tests still run because they use embedded text fixtures, not
  screenshots.

### Project structure

```text
src/
  index.ts                  Public exports
  schema.ts                 Zod schemas and TypeScript types
  ocr.ts                    Tesseract worker + ArrayBuffer OCR
  extractor.ts              Reusable image -> payments API
  parser/
    normalize.ts            Arabic digits / letters / whitespace
    segment-messages.ts     Split OCR text into messages
    extract-payment.ts      Parse fields from one message
    messages.ts             Text -> every payment
  cli/
    index.ts                CLI orchestration
    inputs.ts               Local image discovery
    output.ts               CLI result shape and summaries

scripts/
  extract-payments.ts       Full extraction example
  ocr-image.ts              OCR-only example
  parse-text.ts             Parser-only example
  check-public-images.ts    Optional local screenshot check

tests/
  parser/                   Pure text tests, no OCR needed
  cli/                      File discovery and output tests
  integration/              Optional tests using local screenshots
  fixtures/                 Embedded OCR text samples

public/                     Local screenshots only; ignored by Git
```

The layers are intentionally small:

1. **OCR layer** accepts an `ArrayBuffer`, `Buffer`, or typed-array view.
2. **Parser layer** works with plain text and does not know Tesseract exists.
3. **Extractor layer** combines OCR and parsing.
4. **CLI layer** handles files, output and process concerns.

That separation makes the parser easy to test and lets you copy only the layer
you need into another project.

### Library usage

#### Image as an ArrayBuffer

```ts
import { extractPaymentsFromImage } from "./src";

const payments = await extractPaymentsFromImage(arrayBuffer);
```

#### Reuse one OCR worker for many images

```ts
import { createPaymentExtractor } from "./src";

const extractor = createPaymentExtractor();

try {
  for (const image of images) {
    const payments = await extractor.extract(image); // ArrayBuffer
    console.log(payments);
  }
} finally {
  await extractor.terminate();
}
```

#### Parse text without OCR

Useful in tests, background jobs, or when you already have recognized text.

```ts
import { extractPaymentsFromText } from "./src";

const payments = extractPaymentsFromText(recognizedText);
```

#### Use a file path in tests or scripts

```ts
import { extractPaymentsFromImagePath } from "./src";

const payments = await extractPaymentsFromImagePath("public/full-screen.png");
```

#### Low-level OCR only

```ts
import { createOcrWorker, recognizeImage } from "./src";

const worker = await createOcrWorker(); // Arabic + English by default

try {
  const { text, confidence } = await recognizeImage(worker, arrayBuffer);
  console.log(text, confidence);
} finally {
  await worker.terminate();
}
```

### API summary

| Export | Purpose |
| --- | --- |
| `extractPaymentsFromImage(image, options?)` | One-shot OCR + parsing from image bytes |
| `extractPaymentsFromImagePath(path, options?)` | Same, from a file path |
| `extractPaymentsFromText(text)` | Parse every message from recognized text |
| `createPaymentExtractor(options?)` | Reusable worker with `extract`, `extractFromPath`, `extractFromText`, `recognize`, `terminate` |
| `createOcrWorker(languages?)` | Low-level Tesseract worker |
| `recognizeImage(worker, image)` | Low-level OCR |
| `segmentMessages(text)` | Split text into messages |
| `extractPayment(text)` | Parse one payment message |
| `findMissingFields(payment)` | List important missing fields |

### Output shape

The CLI adds `file`, `messageIndex` and `missingFields` to each payment.
`messageIndex` is zero-based and identifies the message inside the screenshot.

```json
{
  "file": "receipt.png",
  "messageIndex": 1,
  "provider": "vodafone_cash",
  "channel": "sms",
  "direction": "received",
  "status": "success",
  "amount": 250,
  "currency": "EGP",
  "fee": null,
  "total": null,
  "balanceAfter": 1250.0,
  "sender": {
    "name": "Example User",
    "wallet": null,
    "account": null
  },
  "recipient": {
    "name": null,
    "wallet": "01012345678",
    "account": null
  },
  "date": "2026-01-15",
  "time": "14:30",
  "transactionId": "000000000000",
  "reference": null,
  "missingFields": []
}
```

- `date` is normalized to `YYYY-MM-DD`.
- `time` is normalized to 24-hour `HH:mm`.
- `transactionId` and `reference` are kept separate; either can be null.
- `sender` and `recipient` contain a name, wallet number and/or masked account.
- `missingFields` lists important fields that were absent or could not be read
  confidently.

### How messages are found

1. Transaction-start lines such as `تم استلام`, `تم تحويل`, `تم الدفع`,
   `لقد تم الدفع`, `you have received`, or `payment successful` start a new
   message.
2. The nearest timestamp header above a transaction (for example
   `Saturday 9:33 PM`) is included in that message.
3. If no transaction-start line exists, timestamp headers are used as
   boundaries.
4. If neither pattern exists, the whole text is treated as one message.

### Tests and scripts

Each use case has a small, copyable file:

- `scripts/extract-payments.ts` — OCR + parsing + JSON output.
- `scripts/ocr-image.ts` — OCR only.
- `scripts/parse-text.ts` — parser only, from a file or stdin.
- `scripts/check-public-images.ts` — batch check for local images.

Tests are split the same way:

- `bun run test:unit` runs parser and CLI tests. No OCR, images, or network.
- `bun run test:integration` runs local screenshot checks. Tests are skipped
  when `public/` is missing.
- `bun run test` runs everything.

All committed test fixtures use synthetic names, wallets, amounts, and
transaction IDs. Do not replace them with real screenshots or real personal
data.

### Benefits

- **Private by default:** OCR and parsing run locally; screenshots never leave
  the machine unless you explicitly send them somewhere.
- **No bundled personal data:** the project works with `public/` absent.
- **All messages returned:** no more "it found the first SMS and missed the
  second one".
- **Clear layers:** OCR, text parsing, image orchestration and CLI concerns are
  separate and easy to copy into other projects.
- **Small, copy-paste scripts:** each use case has its own runnable example.
- **Text-first testing:** parser tests do not need OCR, images, or network
  access.
- **Validated output:** Zod ensures the final shape is consistent.
- **Arabic-aware parsing:** Arabic-Indic digits, RTL label ordering, and common
  Arabic/English payment wording are handled.

### Downsides and limitations

- **Heuristic parsing, not machine learning.** The parser uses patterns and
  context. A new bank or a changed SMS template can require code updates.
- **OCR quality matters.** Low-resolution images, dark themes, unusual fonts,
  or heavy compression can produce wrong amounts, dates, or IDs. App receipts
  are often harder than SMS messages.
- **Egypt-focused provider detection.** Vodafone Cash, InstaPay, and generic
  bank wording are covered best. Other providers may be labeled `unknown`.
- **Message segmentation is pattern-based.** Unusual layouts with no clear
  transaction phrase or timestamp may be merged or split incorrectly.
- **Fields are nullable by design.** Missing data is reported instead of
  guessed. An amount of `null` means it could not be read confidently.
- **No concurrency manager.** Reuse one extractor for batches, but scheduling,
  retries, and queueing are left to the caller.
- **OCR is CPU-heavy.** Worker startup and recognition take time; a reusable
  worker is faster than one-shot calls.
- **Language files are large.** `*.traineddata` files are ignored; keep them
  locally or let Tesseract fetch them when the environment allows.
- **Not proof of payment.** This extracts text; it does not contact a bank or
  verify that a transaction actually happened.
- **Screenshots are sensitive.** `.gitignore` reduces accidental commits but is
  not encryption or an access-control system.

### Privacy

The following are ignored by Git:

```gitignore
public/
*.traineddata
```

If screenshots were committed before, remove them from the index:

```bash
git rm -r --cached public
```

Do not rely on `.gitignore` alone for secrets. Keep local backups private and
review files before sharing an archive of the project.

---

## العربية

### ما الذي يفعله المشروع؟

يقرأ لقطة الشاشة باستخدام Tesseract OCR، ثم يقسّم النص إلى رسائل منفصلة،
ويستخرج **كل** عملية دفع موجودة في الصورة. هذا مهم لأن لقطة واحدة قد تحتوي على
رسالتين، والرسالة المطلوبة غالبًا هي الأخيرة وليست الأولى.

الحقول التي يستخرجها:

- مزود الخدمة، القناة، اتجاه العملية، وحالة العملية
- المبلغ، العملة، الرسوم، الإجمالي، والرصيد
- بيانات المرسل والمستقبل: الاسم أو المحفظة أو الحساب
- التاريخ والوقت بصيغة موحدة
- رقم العملية أو الرقم المرجعي
- قائمة بالحقول المفقودة

المشروع **لا يحتوي على أي صور**. مجلد `public/` مخصص للصور المحلية فقط،
ومستبعد من Git لأنه قد يحتوي على بيانات شخصية.

### التشغيل السريع

```bash
bun install

# معالجة كل الصور المحلية في ./public إن وجدت
bun run dev

# معالجة صور محددة
bun run scripts/extract-payments.ts ./receipt.png ./another.jpg

# عرض نص OCR فقط
bun run scripts/ocr-image.ts ./receipt.png

# تحليل نص تم استخراجه مسبقًا
bun run scripts/parse-text.ts ./sample.txt
cat ./sample.txt | bun run scripts/parse-text.ts

# فحص كل الصور المحلية
bun run scripts/check-public-images.ts

# الاختبارات وفحص الأنواع
bun run test
bun run test:unit
bun run test:integration
bun run typecheck
```

الأمر الأساسي يطبع مصفوفة JSON على stdout، بينما تظهر رسائل التقدم والأخطاء
على stderr، وبالتالي يظل ناتج JSON صالحًا للاستخدام في أدوات أخرى.

### ماذا يحدث إذا حُذف مجلد `public/`؟

لا شيء يتعطل. المجلد اختياري ويمكن حذفه بالكامل قبل مشاركة المشروع:

- `bun run dev` يطبع رسالة قصيرة بأنه لا توجد صور، ويكتب `[]` على stdout،
  وينتهي بدون خطأ.
- سكربت فحص الصور يوضح أنه لا توجد ملفات لفحصها.
- اختبارات OCR التكاملية يتم تخطيها تلقائيًا.
- اختبارات المحلل والـ CLI تعمل عادي لأنها تستخدم نصوصًا تجريبية داخلية.

### هيكل المشروع

```text
src/
  index.ts                  الصادرات العامة
  schema.ts                 مخططات Zod وأنواع TypeScript
  ocr.ts                    تشغيل Tesseract واستقبال ArrayBuffer
  extractor.ts              واجهة إعادة الاستخدام: صورة -> مدفوعات
  parser/
    normalize.ts            تطبيع الأرقام والحروف والمسافات
    segment-messages.ts     تقسيم نص OCR إلى رسائل
    extract-payment.ts      استخراج الحقول من رسالة واحدة
    messages.ts             نص -> كل المدفوعات
  cli/
    index.ts                تشغيل الـ CLI
    inputs.ts               اكتشاف الصور المحلية
    output.ts               شكل الناتج وملخصاته

scripts/
  extract-payments.ts       مثال استخراج كامل
  ocr-image.ts              مثال OCR فقط
  parse-text.ts             مثال تحليل نص فقط
  check-public-images.ts    فحص اختياري للصور المحلية

tests/
  parser/                   اختبارات نصية بدون OCR
  cli/                      اختبارات اكتشاف الملفات والناتج
  integration/              اختبارات اختيارية بصور محلية
  fixtures/                 نصوص OCR تجريبية مدمجة

public/                     صور محلية فقط، مستبعدة من Git
```

الفصل بين الطبقات مقصود:

1. **طبقة OCR** تستقبل `ArrayBuffer` أو `Buffer`.
2. **طبقة المحلل** تعمل على نص عادي ولا تعرف شيئًا عن Tesseract.
3. **طبقة extractor** تجمع OCR مع التحليل.
4. **طبقة CLI** تتعامل مع الملفات والمخرجات ورمز الخروج.

هذا يجعل نسخ طبقة واحدة إلى مشروع آخر سهلًا، ويجعل الاختبار أسرع.

### الاستخدام البرمجي

#### صورة على هيئة ArrayBuffer

```ts
import { extractPaymentsFromImage } from "./src";

const payments = await extractPaymentsFromImage(arrayBuffer);
```

#### إعادة استخدام عامل OCR لعدة صور

```ts
import { createPaymentExtractor } from "./src";

const extractor = createPaymentExtractor();

try {
  for (const image of images) {
    const payments = await extractor.extract(image); // ArrayBuffer
    console.log(payments);
  }
} finally {
  await extractor.terminate();
}
```

#### تحليل نص بدون OCR

```ts
import { extractPaymentsFromText } from "./src";

const payments = extractPaymentsFromText(recognizedText);
```

#### استخدام مسار ملف في الاختبارات أو السكربتات

```ts
import { extractPaymentsFromImagePath } from "./src";

const payments = await extractPaymentsFromImagePath("public/full-screen.png");
```

#### استخدام OCR فقط بشكل مباشر

```ts
import { createOcrWorker, recognizeImage } from "./src";

const worker = await createOcrWorker(); // العربية + الإنجليزية افتراضيًا

try {
  const { text, confidence } = await recognizeImage(worker, arrayBuffer);
  console.log(text, confidence);
} finally {
  await worker.terminate();
}
```

### ملخص الواجهة

| التصدير | الغرض |
| --- | --- |
| `extractPaymentsFromImage(image, options?)` | OCR وتحليل كامل من bytes الصورة |
| `extractPaymentsFromImagePath(path, options?)` | نفس العملية من مسار ملف |
| `extractPaymentsFromText(text)` | تحليل كل الرسائل من نص جاهز |
| `createPaymentExtractor(options?)` | عامل OCR قابل لإعادة الاستخدام مع `extract` و`extractFromPath` و`extractFromText` و`recognize` و`terminate` |
| `createOcrWorker(languages?)` | عامل Tesseract منخفض المستوى |
| `recognizeImage(worker, image)` | تنفيذ OCR فقط |
| `segmentMessages(text)` | تقسيم النص إلى رسائل |
| `extractPayment(text)` | تحليل رسالة دفع واحدة |
| `findMissingFields(payment)` | عرض الحقول المهمة المفقودة |

### شكل الناتج

يضيف الـ CLI الحقول `file` و`messageIndex` و`missingFields` إلى كل عملية.
الرقم `messageIndex` يبدأ من صفر ويحدد ترتيب الرسالة داخل الصورة.

```json
{
  "file": "receipt.png",
  "messageIndex": 1,
  "provider": "vodafone_cash",
  "channel": "sms",
  "direction": "received",
  "status": "success",
  "amount": 250,
  "currency": "EGP",
  "fee": null,
  "total": null,
  "balanceAfter": 1250.0,
  "sender": {
    "name": "Example User",
    "wallet": null,
    "account": null
  },
  "recipient": {
    "name": null,
    "wallet": "01012345678",
    "account": null
  },
  "date": "2026-01-15",
  "time": "14:30",
  "transactionId": "000000000000",
  "reference": null,
  "missingFields": []
}
```

- التاريخ بصيغة `YYYY-MM-DD`.
- الوقت بصيغة 24 ساعة `HH:mm`.
- رقم العملية والرقم المرجعي منفصلان، ويمكن أن يكون أحدهما فارغًا.
- بيانات المرسل والمستقبل قد تحتوي على اسم أو محفظة أو حساب مقنّع.
- `missingFields` تعرض الحقول المهمة غير الموجودة أو غير الواضحة.

### كيف يتم اكتشاف الرسائل؟

1. تبدأ الرسالة الجديدة عند سطر مثل `تم استلام` أو `تم تحويل` أو `تم الدفع`
   أو `لقد تم الدفع` أو `you have received` أو `payment successful`.
2. يتم ضم أقرب عنوان وقت أعلى العملية، مثل `Saturday 9:33 PM`، إلى الرسالة.
3. إذا لم يوجد سطر بداية عملية، تُستخدم عناوين الوقت كحدود بين الرسائل.
4. إذا لم يوجد أي نمط، يُعامل النص كله كرسالة واحدة.

### الاختبارات والسكربتات

كل حالة استخدام لها ملف صغير مستقل يمكن نسخه:

- `scripts/extract-payments.ts` — OCR + تحليل + إخراج JSON.
- `scripts/ocr-image.ts` — OCR فقط.
- `scripts/parse-text.ts` — المحلل فقط، من ملف أو من stdin.
- `scripts/check-public-images.ts` — فحص مجموعة صور محلية.

الاختبارات مقسمة بنفس الطريقة:

- `bun run test:unit` يشغل اختبارات المحلل والـ CLI بدون OCR أو صور أو شبكة.
- `bun run test:integration` يشغل اختبارات الصور المحلية، ويتم تخطيها إذا لم
  يوجد مجلد `public/`.
- `bun run test` يشغل كل شيء.

كل البيانات داخل الاختبارات المنشورة وهمية: الأسماء والمحافظ والمبالغ وأرقام
العمليات. لا تستبدلها بصور حقيقية أو بيانات شخصية.

### المزايا

- **الخصوصية أولًا:** كل شيء يعمل محليًا بدون خدمات سحابية أو مفاتيح API.
- **لا توجد بيانات شخصية داخل المشروع:** المشروع يعمل حتى لو حُذف `public/`.
- **إرجاع كل الرسائل:** لا يكتفي بالرسالة الأولى ويترك الأخيرة.
- **طبقات واضحة:** OCR والمحلل والواجهة والـ CLI منفصلة، مما يسهل النسخ
  والاستخدام في مشاريع أخرى.
- **سكربتات صغيرة لكل حالة:** كل حالة استخدام لها مثال مستقل يمكن نسخه.
- **اختبارات نصية:** لا تحتاج صورًا أو شبكة أو OCR لاختبار المحلل.
- **ناتج متحقق منه:** Zod يضمن شكلًا ثابتًا للبيانات.
- **دعم جيد للعربية:** الأرقام العربية، ترتيب RTL، والمصطلحات الشائعة.

### العيوب والحدود

- **التحليل قائم على قواعد وليس ذكاءً اصطناعيًا.** أي بنك جديد أو قالب رسالة
  مختلف قد يحتاج تعديلًا في الأكواد.
- **جودة الصورة تؤثر مباشرة.** الصور منخفضة الدقة أو الداكنة أو المضغوطة قد
  تنتج مبالغ أو تواريخ أو أرقام عمليات خاطئة.
- **المزودون المدعومون محدودون.** التركيز الأكبر على فودافون كاش وإنستاباي
  والصيغ البنكية العامة؛ مزودون آخرون قد يظهرون باسم `unknown`.
- **تقسيم الرسائل تقريبي.** التنسيقات الغريبة التي لا تحتوي على عبارة عملية
  أو وقت واضح قد تُدمج أو تُقسم بشكل غير صحيح.
- **بعض الحقول تكون فارغة.** المشروع يفضّل الإبلاغ عن النقص بدل تخمين قيمة
  غير مؤكدة.
- **لا يوجد نظام تزامن أو إعادة محاولة.** يمكن إعادة استخدام extractor
  لعدة صور، لكن الجدولة وإعادة المحاولة مسؤولية المستخدم.
- **OCR يستهلك المعالج.** تشغيل العامل وإعادة استخدامه أسرع من إنشاء عامل
  جديد لكل صورة.
- **ملفات اللغة كبيرة.** ملفات `*.traineddata` مستبعدة، ويمكن تحميلها محليًا
  أو ترك Tesseract يجلبها إذا سمحت البيئة.
- **ليس إثباتًا للدفع.** الأداة تستخرج النص فقط ولا تتواصل مع البنك أو تتحقق
  من حدوث العملية فعليًا.
- **الصور حساسة.** `.gitignore` يقلل خطر الرفع بالخطأ لكنه ليس تشفيرًا ولا
  نظام صلاحيات.

### الخصوصية

يتم تجاهل التالي بواسطة Git:

```gitignore
public/
*.traineddata
```

إذا كانت هناك صور مضافة إلى Git سابقًا، أزلها من الفهرس:

```bash
git rm -r --cached public
```

لا تعتمد على `.gitignore` وحده لحماية الأسرار. احتفظ بنسخ احتياطية خاصة،
وراجع الملفات قبل مشاركة أرشيف المشروع.
