# 🤖 ZYNX — בלוטפרינט עסק מלא: סוכני AI לקליניקות אסתטיקה בישראל

הקופסה השלמה להקמת והפעלת **ZYNX** — עסק שמוכר סוכני AI (צ'אטבוטים בוואטסאפ + אינסטגרם)
לקליניקות אסתטיקה וקוסמטיקאיות בישראל. הקמה גבוהה (₪6,000–14,000) + ריטיינר חודשי (₪1,500–4,000).
**הכל מוכן למכור מחר.**

> 🎨 זהות המותג (לוגו, צבעים, פונטים) ב-`brand/` · גרדיאנט חתימה כחול→סגול `#38A1FF → #7B4DFF` על שחור.

## 🧭 מאיפה מתחילים

1. קרא את **`01-blueprint.md`** — המודל, התמחור, המספרים.
2. הקם את **בוט הדמו** (`../tools/clinic_bot.py --scenario lead_night`) וצלם מסך.
3. פתח בדפדפן את **`landing-page/index.html`** ואת **`sales-deck/deck.html`** — אלה נכסי המכירה.
4. בנה רשימת לידים (`../tools/find_clinics.py` + `02b-lead-generation-playbook.md`).
5. הקם אינסטגרם (`instagram/01-account-setup.md`) ושלח Outreach (`03-sales-kit.md`).
6. סגור 3 לקוחות Founders → אסוף Case Studies → העלה מחיר.

## 📂 כל מה שנמצא כאן

### אסטרטגיה
| קובץ | תוכן |
|------|------|
| `01-blueprint.md` | מודל עסקי, ICP, חבילות, תמחור, מודל פיננסי, תוכנית 90 יום |
| `02-product-and-bot.md` | מה הבוט עושה + System Prompt בעברית + תרחישי דמו |
| `02b-lead-generation-playbook.md` | איך למצוא ולתעדף 50-100 לידים בישראל |
| `03-sales-kit.md` | Outreach, שיחת מכירה, Loom, טיפול בהתנגדויות |
| `04-delivery-ops.md` | סטאק טכנולוגי, אונבורדינג, SOP אספקה, ריטיינר, חוזה |

### מותג ZYNX
| קובץ | תוכן |
|------|------|
| `brand/zynx-logo-original.jpeg` | הלוגו המקורי המלא — מקור האמת |
| `brand/zynx-logo-trimmed.png` | לוקאפ חתוך נקי — לכותרות/אתר/מצגת |
| `brand/zynx-avatar.png` | סימן Z בריבוע — אווטאר אינסטגרם/וואטסאפ |
| `brand/brand.md` | מדריך מותג: צבעים, פונטים, שימוש |

### נכסי מכירה (פרימיום — פתח בדפדפן)
| קובץ | תוכן |
|------|------|
| `landing-page/index.html` | דף נחיתה פרימיום (מותג ZYNX) עם FOMO, יכולות, ROI, FAQ, CTA |
| `sales-deck/deck.html` | מצגת מכירה 12 שקופיות (ניווט עם חיצים, F למסך מלא) |
| `proposal/proposal-template.md` | תבנית הצעת מחיר/הצעה עסקית לשליחה ללקוח |
| `ad-sketches/ad-mockup.html` | סקיצת מודעה (3 זוויות, מוקאפ בלבד — לא פורסם) |

### ערכת אינסטגרם + ממומן
| קובץ | תוכן |
|------|------|
| `instagram/01-account-setup.md` | הקמת חשבון: שם, ביו, היילייטס, אמינות מיום 1 |
| `instagram/02-organic-content-engine.md` | עמודי תוכן, 12 פוסטים מוכנים, לוח 30 יום |
| `instagram/03-paid-ads-blueprint.md` | קמפיין Meta: טירגוט, תקציב, פאנל, KPI, מדיניות |
| `instagram/04-ad-creative-pack.md` | 8-10 נוסחי מודעה + פרומפטים ויזואליים + תסריטי וידאו |
| `instagram/05-launch-plan-and-qa.md` | ביקורת איכות + תוכנית השקה מאוחדת 7 ימים |

### קוד עובד (בתיקיית `../tools/` ו-`../workflows/`)
| קובץ | תוכן |
|------|------|
| `tools/clinic_bot.py` | הבוט: דמו לא-מקוון + מצב חי (Claude API) |
| `tools/find_clinics.py` | איתור ודירוג לידים (Google Places / demo) |
| `tools/clinic_bot_whatsapp.py` | חיבור וואטסאפ אמיתי (GreenAPI webhook) |
| `workflows/clinic_chatbot.md` | WAT SOP להקמה ואספקה |

## ⚠️ לפני שמשיקים
- החלף בדף הנחיתה ובמצגת: לוגו, צבעים, **מספר וואטסאפ** (יש placeholder בכפתור ה-CTA).
- מלא קובץ config לכל לקוח (`../tools/clinic_bot_config.example.json`).
- קרא את `instagram/05-launch-plan-and-qa.md` — שם נמצאות אזהרות מדיניות Meta ותוכנית ההשקה.
- אף מודעה לא פורסמה. הסקיצות והקמפיין מוכנים — הפעלה בפועל דורשת את חשבון המודעות שלך.
