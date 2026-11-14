# طباعتي (Tibaeati Web)

## بالعربية

تطبيق ويب تقدّمي (PWA) لطباعة البطاقات والمستمسكات العراقية بقياساتها الحقيقية، يعمل بدون إنترنت بعد أول فتح،
ويعمل على آيفون وآيباد وماك من نفس الكود. هذه نسخة الويب من تطبيق iOS «طباعتي».

**الخصوصية:** جميع بياناتك تبقى على جهازك. لا يوجد خادم ولا حسابات ولا تحليلات ولا خطوط أو سكربتات من الإنترنت.

### التثبيت

- **آيفون وآيباد (Safari):** افتح الرابط، اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية».
- **ماك (Safari 17 أو أحدث):** من قائمة ملف اختر «إضافة إلى Dock».
- **ماك وويندوز (Chrome / Edge):** اضغط أيقونة التثبيت في شريط العنوان.

### أوامر التطوير

```
npm ci            # تثبيت الحزم
npm run dev       # تشغيل محلي
npm run check     # lint + typecheck + test + build
npm run preview   # معاينة نسخة الإنتاج
```

الحالة: الهيكل الأول (S0) جاهز: الصفحة الرئيسية، الإعدادات، العمل بدون إنترنت. الميزات قادمة حسب `SPEC.md`.

## English

Tibaeati Web is an offline-first Progressive Web App for printing Iraqi ID cards and documents at exact
physical sizes. It runs on iPhone, iPad and Mac from one codebase, and is the web re-creation of the
iOS app "Tibaeati".

**Privacy:** all data stays on your device. There is no server, no account, no analytics, and no remote
fonts or scripts.

### Install

- **iPhone / iPad (Safari):** open the site, tap Share, then "Add to Home Screen".
- **Mac (Safari 17+):** File menu, "Add to Dock".
- **Mac / Windows (Chrome, Edge):** click the install icon in the address bar.

### Development

```
npm ci            # install dependencies
npm run dev       # local dev server
npm run check     # lint + typecheck + test + build
npm run preview   # serve the production build
```

Other scripts: `npm test`, `npm run lint`, `npm run typecheck`, `npm run format`.

Status: slice S0 (walking skeleton): home with six modes, settings, offline shell. Features follow
`SPEC.md`; structure and import rules are in `ARCHITECTURE.md`; the visual system is in `DESIGN.md`.
