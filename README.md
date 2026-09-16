# 🎬 AKAVOX | أكافوكس — منصة الأفلام الكلاسيكية القانونية ذاتية التحديث بالكامل

منصة ويب متطورة وقانونية بنسبة 100% متخصصة في أرشفة وبث أفلام النطاق العام (Public Domain) ورخص المشاع الإبداعي المتوافقة تجارياً (Creative Commons)، تعمل بشكل **ذاتي وتلقائي بالكامل** بدون أي تدخل بشري، ومزودة بمحرك فحص تراخيص فائق الصرامة، وتوليد تلقائي لـ SEO و Schema.org، ومجدول زمني آلي، ولوحة تحكم إدارية متكاملة وجاهزة للربح من الإعلانات.

---

## 🌟 أبرز المميزات المعمارية والتقنية

- 🤖 **أتمتة كاملة (Zero Manual Work):** جلب آلي، استخراج للبيانات، تنظيف، تحقق قانوني، منع التكرار، توليد الروابط والصفحات، وتحديث خرائط الموقع.
- ⚖️ **حماية قانونية صارمة 100%:** لا يتم استيراد أي عنصر إلا بعد التحقق الفردي من ترخيصه (قبول Public Domain, CC0, CC BY, CC BY-SA، والرفض الفوري لأي مادة غامضة، أو ذات حقوق محفوظة، أو تمنع الاستخدام التجاري مثل CC BY-NC).
- 🏛️ **مصدر موثوق ورسمي:** التكامل المباشر مع Internet Archive API الرسمية والمجانية دون الحاجة لمفاتيح مدفوعة.
- 🚀 **واجهة سينمائية حديثة وخفيفة:** Dark Cinema Theme سريع الاستجابة (Mobile-First) بدون أي اعتماديات خارجية أو مكتبات ثقيلة، سرعة تحميل أقل من ثانية.
- 🔍 **SEO Automation متقدم:** توليد تلقائي للـ Meta Tags، و Open Graph، و Twitter Cards، و Schema.org `Movie` JSON-LD، و Breadcrumbs، و `/sitemap.xml` ديناميكي محدث لحظياً، و `/robots.txt`.
- ⏰ **مجدول مهام ذكي (Background Scheduler):** يعمل كل 6 ساعات (قابل للتعديل) لجلب دفعات جديدة دورياً ومواصلة الأرشفة التلقائية.
- 🛡️ **نظام متقدم لكشف ومنع التكرار (Duplicate Detector):** اعتماداً على Identifier الفريد، ورابط المصدر، والبصمة الرقمية للعنوان والسنة، مع تحديث وإثراء البيانات عند توفر تفاصيل أفضل.
- 💰 **جاهزية كاملة للإعلانات (Ad Monetization Ready):** 4 مواقع إعلانية جاهزة (Header Leaderboard 728x90, Sidebar Rectangle 300x250, In-Content Responsive, Footer Banner 728x90) قابلة للتفعيل والتعطيل وتغيير الأكواد من لوحة الإدارة.
- 🎛️ **لوحة تحكم إدارية شاملة (Admin Dashboard):**
  - شاشة مراقبة لحظية ومؤشرات أداء رئيسية (KPIs).
  - نافذة تشغيل واستيراد فوري مباشر (Live Terminal) لمراقبة الاستيراد خطوة بخطوة عبر Server-Sent Events.
  - إدارة كاملة للأفلام (تعديل طوارئ، حذف، تغيير حالة النشر).
  - سجل تدقيق العمليات (Audit Logs) وتفاصيل الأحداث.
  - إدارة العناصر المرفوضة (Failed & Rejected Items) مع خيار إعادة المحاولة أو التجاهل الدائم.
  - إعدادات المصادر، وقواعد التراخيص، وقوالب الـ SEO، والإعلانات، والإعدادات العامة.

---

## 🏗️ هيكلية المشروع (Project Architecture)

```
/home/user/
  ├── package.json                  # توصيف المشروع والتبعيات
  ├── server.js                     # نقطة الانطلاق الرئيسية وخادم Express
  ├── .env.example                  # نموذج المتغيرات البيئية
  ├── README.md                     # التوثيق الشامل
  ├── db/
  │    ├── database.js              # طبقة التعامل مع SQLite والمزامنة
  │    ├── schema.sql               # مخطط قاعدة البيانات والفهارس
  │    └── akavox.db           # ملف قاعدة البيانات الفعلي (SQLite WAL mode)
  ├── services/
  │    ├── archiveFetcher.js        # جالب البيانات من Internet Archive API
  │    ├── licenseValidator.js      # فاحص التراخيص والحماية القانونية
  │    ├── dataCleaner.js           # منظف ومطهر البيانات وتوليد الـ Slugs
  │    ├── duplicateDetector.js     # كاشف التكرار والبصمة الرقمية
  │    ├── importer.js              # محرك خط أنابيب الاستيراد والتخزين
  │    ├── scheduler.js             # المجدول الزمني التلقائي للخلفية
  │    └── seoService.js            # مولد الـ SEO والـ JSON-LD والـ Sitemaps
  ├── routes/
  │    ├── publicRoutes.js          # مسارات الواجهة الأمامية العامة والصفحات الثابتة
  │    ├── adminRoutes.js           # مسارات لوحة التحكم وتوثيق الدخول
  │    └── apiRoutes.js             # واجهات برمجة التطبيقات (Health, SSE Stream, Triggers)
  ├── views/
  │    ├── partials/                # القوالب الجزئية (Header, Footer, MovieCard, AdSlot, Breadcrumbs)
  │    ├── public/                  # صفحات الواجهة (Home, Movie Detail, Genre, Year, Search, About, Contact, Privacy, Terms, Sitemap)
  │    └── admin/                   # صفحات لوحة الإدارة (Dashboard, Movies, Edit, Logs, Failed, Settings)
  └── public/
       ├── css/styles.css           # التصميم السينمائي الحديث المتجاوب
       ├── js/main.js               # سكريبتات الواجهة الأمامية ونسخ الـ Attribution
       ├── js/admin.js              # سكريبتات لوحة التحكم وشاشة الـ SSE المباشرة
       └── images/placeholder-poster.svg  # بوستر بديل متجهي عالي الدقة
```

---

## 🗄️ مخطط قاعدة البيانات (Database Schema)

قاعدة البيانات مبنية على **SQLite 3** مع تفعيل وضع **WAL (Write-Ahead Logging)** وقيود المفاتيح الأجنبية لضمان أعلى أداء واستقرار تحت الضغط:

1. **`movies`**:
   - `id`: المعرف الأساسي التلقائي.
   - `external_id`: معرف العنصر الفريد من Internet Archive (`identifier`).
   - `source_url`: رابط صفحة الفيلم على الأرشيف.
   - `title`, `original_title`, `slug`: العنوان والعنوان النظيف والـ Slug الفريد.
   - `year`: سنة الإصدار المنظفة (4 أرقام).
   - `description`: الوصف المنظف والمطهر من أكواد HTML التالفة.
   - `duration`, `duration_raw`: المدة بالدقائق والصيغة الأصلية.
   - `language`: لغة الفيلم.
   - `poster_url`: رابط البوستر المستخرج والمتحقق منه.
   - `video_url`, `embed_url`: رابط البث ومشغل التضمين المتوافق.
   - `director`: اسم المخرج.
   - `cast_members`: مصفوفة JSON بأسماء النجوم.
   - `genres`: مصفوفة JSON بالتصنيفات المنظفة.
   - `license_type`, `license_url`: نوع الترخيص ورابطه الرسمي.
   - `rights_statement`: بيان الحقوق المسجل.
   - `attribution_required`, `attribution_text`: شروط ونصوص الإسناد التلقائي.
   - `status`: حالة النشر (`published` أو `draft`).
   - `view_count`: عداد المشاهدات.
   - `created_at`, `updated_at`, `imported_at`, `last_checked_at`: طوابع زمنية للتدقيق.

2. **`genres`**: التصنيفات الفردية وإحصائيات عدد الأفلام لكل تصنيف لتسريع التصفح.
3. **`movie_genres`**: جدول علاقة متعدد إلى متعدد (Many-to-Many) بين الأفلام والتصنيفات.
4. **`import_logs`**: سجل شامل لكل دورة استيراد (الوقت المستغرق، العناصر المعثور عليها، المستوردة، المتجاوزة، المرفوضة ترخيصاً، المكررة، وسجل أحداث JSON التفصيلي).
5. **`failed_items`**: قائمة العناصر التي رُفضت مع سبب الرفض وإمكانية التجاهل الدائم.
6. **`settings`**: إعدادات النظام وتكوينات التراخيص وقوالب الـ SEO وأكواد الإعلانات.
7. **`admins`**: حسابات المديرين المشفرة بـ HMAC-SHA256.

---

## ⚖️ قواعد فحص التراخيص (Strict License Validation Rules)

يقوم المحرك بفحص التراخيص عبر مصفوفة قواعد دقيقة لا تقبل أي شبهة:

| نوع الترخيص | الحالة | إجراء النظام |
|---|---|---|
| **Public Domain Mark 1.0** | ✅ مقبول | استيراد تلقائي ونشر فوري |
| **Creative Commons CC0 1.0** | ✅ مقبول | استيراد تلقائي بدون قيود |
| **CC BY (Attribution)** | ✅ مقبول | استيراد تلقائي + توليد نص الإسناد وعرضه على الصفحة |
| **CC BY-SA (ShareAlike)** | ✅ مقبول | استيراد تلقائي + توليد نص الإسناد والترخيص المتوافق |
| **Pre-1929 Publications (US)** | ✅ مقبول | مشمولة بالنطاق العام قانونياً وتوثيق تاريخ الصدور |
| **CC BY-NC (Non-Commercial)** | ❌ **مرفوض** | رفض فوري لمنع أي نزاع حول ربح الإعلانات |
| **CC BY-NC-SA / NC-ND** | ❌ **مرفوض** | رفض فوري وتسجيل في `failed_items` |
| **All Rights Reserved** | ❌ **مرفوض** | رفض فوري للحفاظ على الملكية الفكرية |
| **Unknown / Missing License** | ❌ **مرفوض** | رفض أي عنصر لا يملك إثبات ترخيص صريح |

> ⚙️ يمكن لمدير الموقع تعديل أو تخصيص هذه القواعد في أي لحظة من خلال لوحة التحكم: **Settings > Strict License Rules**.

---

## 🚀 التثبيت والتشغيل المحلي (Installation & Quick Start)

### المتطلبات الأساسية:
- **Node.js**: الإصدار 18 أو 20 أو أحدث.
- **NPM**: الإصدار 9 أو أحدث.

### خطوات التثبيت:

```bash
# 1. الدخول إلى مجلد المشروع
cd /home/user

# 2. تثبيت الحزم المطلوبة
npm install

# 3. إعداد ملف البيئة
cp .env.example .env

# 4. تشغيل الخادم والمنصة
npm start
```

بمجرد تشغيل الخادم:
1. ستنشئ قاعدة البيانات جداولها تلقائياً.
2. سيتولد حساب الأدمن الافتراضي:
   - **اسم المستخدم:** `admin`
   - **كلمة المرور:** `admin123`
3. سيبدأ المجدول الآلي (`node-cron` & interval) بالعمل دورياً.
4. إذا كانت قاعدة البيانات فارغة، سيقوم النظام باستيراد دفعة تأسيسية تضم 15 فيلماً كلاسيكياً مؤكداً قانونياً.

---

## 🔐 لوحة التحكم الإدارية (Admin Dashboard)

- **الرابط:** `http://localhost:3000/admin`
- **بيانات الدخول الافتراضية:** `admin` / `admin123`
- **الوظائف المتاحة:**
  - **Dashboard Overview:** شاشة المؤشرات الإحصائية الحية + زر `Run Import Now` مع شاشة كونسول تفاعلية تنقل سير العملية في الوقت الحقيقي عبر SSE.
  - **Movies Library:** استعراض الأفلام، البحث بالاسم والمخرج، الفلترة حسب الحالة، التعديل الطارئ، الحذف، وتبديل حالة النشر.
  - **Import Audit Logs:** سجل كامل لكل عمليات الاستيراد التاريخية مع إمكانية فتح تفاصيل الأحداث.
  - **Failed & Rejected Items:** قائمة الأفلام التي حجبها فاحص التراخيص مع أسباب الرفض وزر التجاهل الدائم.
  - **Source Settings:** تحديد المجموعات المستهدفة من Internet Archive (`feature_films`, `silent_films`, `Comedy_Films`, إلخ)، وحجم الدفعة، ومعدل التكرار الزمني.
  - **License Rules:** تفعيل أو تعطيل أنواع التراخيص المقبولة وضبط سنة القطع التاريخية.
  - **SEO Automation:** تخصيص قوالب العناوين والوصف للمحركات والصورة الافتراضية للـ Open Graph.
  - **Ad Placements:** تفعيل وتعطيل وحدات الإعلانات الأربعة ولصق أكواد Google AdSense بسهولة.
  - **General Settings:** اسم الموقع، وصفه، البريد القانوني، مسؤول الـ DMCA، وروابط الموقع.

---

## 🔍 أتمتة الـ SEO والفهرسة (SEO Automation)

تم بناء النظام ليكون مفضلاً لمحركات البحث (Google, Bing) بدون أي تدخل:

1. **روابط نظيفة ودلالية (Clean URLs):**
   - صفحة الفيلم: `/movie/the-phantom-of-the-opera-1925`
   - صفحة التصنيف: `/genre/comedy`
   - صفحة السنة: `/year/1938`
   - صفحة البحث: `/search?q=chaplin`
2. **Schema.org Structured Data (JSON-LD):**
   - ترميز كامل لـ `@type: "Movie"` يشمل الاسم، الوصف، سنة الإصدار، المدة بصيغة ISO 8601 (`PT77M`)، المخرج، الممثلين، ورابط الترخيص الرسمي.
   - ترميز `BreadcrumbList` لسهولة التنقل وفهرسة المسارات.
3. **XML Sitemap ديناميكي (`/sitemap.xml`):**
   - يتحدث آلياً مع كل فيلم جديد مستورد، ويتضمن الأولوية (`priority`) وتاريخ آخر تعديل (`<lastmod>`).
4. **ملف الزواحف (`/robots.txt`):**
   - يسمح بفهرسة كافة صفحات الأفلام والتصنيفات ويحمي لوحة الإدارة وواجهات الـ API.

---

## 🌐 النشر على بيئات الإنتاج (Production Deployment)

### الخيار 1: النشر عبر VPS (DigitalOcean / Hetzner / Linode) باستخدام PM2 و Nginx

```bash
# 1. تثبيت مدير العمليات PM2
npm install -g pm2

# 2. تشغيل التطبيق في الخلفية
pm2 start server.js --name "akavox"

# 3. حفظ إعدادات التشغيل التلقائي عند إعادة إقلاع السيرفر
pm2 save
pm2 startup
```

**إعداد Nginx كـ Reverse Proxy مع شهادة SSL مجانية (Let's Encrypt):**

```nginx
server {
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# إصدار شهادة SSL
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### الخيار 2: النشر عبر منصات السحاب الحديثة (Railway / Render)
1. ارفع المشروع إلى مستودع GitHub.
2. اربط المستودع بمنصة **Railway** أو **Render**.
3. أضف متغيرات البيئة من ملف `.env.example`.
4. التطبيق سيكتشف تلقائياً أمر `npm start` ويعمل على الفور مع Persistent Volume لمجلد `db`.

---

## ➕ كيفية إضافة مصادر أو مجموعات أرشيفية جديدة مستقبلاً

تم تصميم النظام بطريقة **Modular** بالكامل:
1. **لإضافة مجموعات جديدة من Internet Archive:**
   - انتقل إلى لوحة التحكم > **Source & Archive API**
   - أضف اسم المجموعة في حقل المجموعات، مثل: `classic_cartoons`, `film_noir`, `sci_fi_horror`
   - اضغط **Save** وسيبدأ النظام فوراً بتضمينها في دورات الجلب القادمة.
2. **لإضافة مزود بيانات خارجي جديد (مثل Wikimedia Commons أو متحف أرشيفي):**
   - أنشئ Fetcher جديد داخل مجلد `services/` (مثل `wikimediaFetcher.js`) يتبع نفس واجهة `archiveFetcher.js`.
   - مرر النتائج مباشرة إلى `LicenseValidator` و `DataCleaner`.
   - لا يتطلب ذلك أي تغيير في قاعدة البيانات أو الواجهة الأمامية!

---


---

## 📚 نظام المصادر المتعددة (Multi-Source System) — أُضيف 2026-09

تمت ترقية المنصة إلى بنية **سجل مصادر معياري (Modular Source Registry)** يسمح بتشغيل عدة مصادر أفلام قانونية بشكل مستقل تماماً إلى جانب المصدر الأصلي (Internet Archive) **دون أي تعديل عليه**:

- 🆕 **المصدر الجديد: Wikimedia Commons** — عبر واجهة MediaWiki Action API الرسمية (بدون مفاتيح)، مع فحص ترخيص فردي صارم لكل ملف (قبول Public Domain / CC0 / CC BY / CC BY-SA فقط، ورفض فوري لأي ترخيص NC/ND أو غامض — سياسة "الإغلاق الآمن").
- 🏛️ **المصدر القديم (Internet Archive):** محمي بالكامل — لا يمكن تعطيله أو تعديله من واجهة المصادر الجديدة، ويستمر بمجدوله وإعداداته كما هي.
- 🗂️ **الهيكلية:**
  ```
  movie_sources/
  ├── base/            (BaseImporter, BaseFetcher, BaseParser, BaseLicenseChecker,
  │                     BaseValidator, BaseDuplicateChecker, SourceRegistry)
  ├── legacy_source/   (وصف للقراءة فقط للمصدر القديم)
  ├── wikimedia_commons/ (Fetcher + Parser + LicenseChecker + Validator + Importer)
  └── index.js         (نقطة تسجيل المصادر — سطر واحد لإضافة مصدر جديد)
  ```
- 🎛️ **لوحة إدارة المصادر:** `/admin/movie-sources` — بطاقة حالة لكل مصدر (آخر/تالي استيراد، إحصائيات آخر دورة، اختبار اتصال حقيقي، تشغيل فوري، تفعيل/تعطيل، إعدادات)، شاشة كونسول حية (SSE)، عارض سجلات الاستيراد بفلاتر، وسجل العناصر المرفوضة مع أسباب الرفض والبيانات الخام للتدقيق القانوني.
- ⏰ **مجدول مصادر مستقل:** كل 6 ساعات (قابل للضبط `source_import_frequency_hours`) مع منع التداخل — منفصل تماماً عن مجدول المصدر القديم.
- 🗄️ **ترحيلات قاعدة بيانات إضافية وعكوسة:** أعمدة `source_id/source_type/can_rehost/original_source_url` على الأفلام (مع وسم الأفلام القديمة تلقائياً كـ legacy)، جدولا `movie_sources` و`rejected_items`، وتوسيع `import_logs` — دون حذف أو تعديل أي بيانات قائمة.
- 📑 **التوثيق القانوني:** `docs/SOURCE_VALIDATION_wikimedia_commons.md` (قالب التحقق الإلزامي مع الأدلة)، `docs/ADMIN_GUIDE_movie_sources.md` (دليل الاستخدام)، `docs/IMPLEMENTATION_REPORT.md` (تقرير التطبيق وقائمة المراجعة).
- 🧪 **اختبارات:** `npm test` — 27 اختباراً تغطي فحص التراخيص، خط الأنابيب الكامل، منع التكرار بين المصادر، حماية بيانات المصدر القديم، وعكس الترحيلات.

## 🛡️ سياسة الـ DMCA وإخلاء المسؤولية القانونية

- المنصة لا تستضيف أي ملفات فيديو ذات حقوق حصرية.
- كافة الأفلام المعروضة هي مواد تراثية في النطاق العام العالمي أو مرخصة تحت رخص المشاع الإبداعي المفتوحة ومسحوبة من الأرشيف الرقمي المفتوح (Internet Archive).
- تتوفر صفحة مخصصة للـ DMCA على الرابط `/contact` تتضمن نموذج إخطار فوري وبريد مسؤول الامتثال القانوني (`legal@akavox.org`)، مع التزام رسمي بحجب أي مادة متنازع عليها خلال 24 ساعة عمل.

---

**AKAVOX (أكافوكس)** — صُنع بأعلى معايير البرمجة والأتمتة لتخليد التراث السينمائي العالمي بشكل قانوني ومستدام! 🎬✨
