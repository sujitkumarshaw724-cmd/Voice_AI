# Zoya AI Assistant — APK Build Guide (Termux + GitHub Actions)

Ye guide aapke "Zoya AI Assistant" (React + Vite + Gemini Live API) web app ko
Android APK me convert karne ke liye hai. Heavy build (Gradle/Android SDK)
GitHub ke servers pe hoga — Termux sirf code push karega.

---

## Zaroori cheezein pehle se

- Termux app (F-Droid se install karna, Play Store wala purana/broken hai)
- GitHub account + ek naya empty repository (public ya private, dono chalega)
- Internet connection

---

## Step 1: Termux setup

```bash
pkg update && pkg upgrade -y
pkg install nodejs git openssh -y
node -v   # confirm node installed hai
```

---

## Step 2: Zip extract karo

`zoya-ai-assistant-android-ready.zip` (poori merged project) ko Termux me
extract karo — ismein sab kuch already ready hai (code, package.json,
workflow file, .env.local me aapki API key bhi):

```bash
cd ~/storage/downloads
unzip zoya-ai-assistant-android-ready.zip
cd zoya-final
```

---

## Step 3: Dependencies install + Capacitor Android platform add karo

```bash
npm install
npx cap add android
bash add-permissions.sh
bash install-automation.sh
```

`npx cap add android` ek `android/` folder banayega (poora Android Studio
project) — isse commit karna hai.

- `add-permissions.sh` — microphone, camera, audio permissions add karega
- `install-automation.sh` — **full device control module** install karega:
  ek native Accessibility Service jo Zoya ko screen dekhne, tap/type/scroll
  karne ki taaqat degi, plus call/SMS ke liye permissions

---

## Step 3.5: Ek baar Android Studio/Termux me sync karo

```bash
npx cap sync android
```

### ⚠️ Full control feature — zaroori jaankari

- Install hone ke baad, app kholke **Settings → Accessibility → Zoya AI
  Assistant → Enable** karna hoga (ye Android khud manually karwata hai,
  koi app isse automatically on nahi kar sakta — ye security ke liye hai)
- Pehli baar call/SMS use karne par Android permission popup dikhayega
  (Allow karna hoga)
- Zoya ab bol ke: apps kholna, screen ke buttons/text par tap karna, type
  karna, scroll karna, calls lagana, aur SMS bhejna — sab kar sakti hai
- **Safety**: maine system prompt me ye rule daal diya hai ki call/message
  bhejne se pehle Zoya number aur message confirm karegi aapse — taaki
  galti se kisi aur ko na chala jaye

---

## Step 4: GitHub Secret set karo (API key ke liye — sirf ek baar)

Aapne jo Gemini API key di thi, wo maine `.env.local` me daal di hai
(ye file `.gitignore` me hai, kabhi GitHub par push nahi hogi — safe hai).
Lekin GitHub Actions cloud pe build karta hai, to usse key alag se deni
padegi — **repo me hardcode karne se agar repo public hai to key leak ho
sakti hai**, isliye GitHub ka secure "Secrets" feature use karo:

1. GitHub par apna repo banane/push karne ke baad, repo ke
   **Settings → Secrets and variables → Actions** par jao
2. **"New repository secret"** par click karo
3. Name: `GEMINI_API_KEY`
4. Value: `YOUR_GEMINI_API_KEY_HERE`
5. **Add secret** dabao

Bas itna hi — ab build ke time ye key automatically use hogi, kahi
dikhegi nahi.

---

## Step 5: GitHub par push karo

```bash
git init
git add .
git commit -m "Zoya AI Assistant - Android build setup"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Termux me GitHub login ke liye Personal Access Token banana padega
(Settings > Developer Settings > Personal Access Tokens on github.com),
password ki jagah wahi token use karna push karte waqt.

---

## Step 6: GitHub Actions apne aap APK banayega

Push hote hi GitHub Actions automatically trigger ho jayega:
1. Apne repo ke **"Actions"** tab me jao
2. "Build Zoya Android APK" workflow run dikhega (2-4 min lagenge)
3. Complete hone ke baad, run ke andar **"Artifacts"** section me
   `zoya-debug-apk` milega — usse download karo (zip me APK hoga)

---

## Step 7: APK install karo

Downloaded `.apk` file ko phone me transfer karke open karo. Agar
"Install blocked" aaye to Settings > Security > "Install unknown apps"
me apna file manager/browser allow karo.

App open karke Settings me apna **Gemini API key** daalna hoga
(Google AI Studio se free key milta hai: https://aistudio.google.com/apikey) —
key sirf phone par locally save hoti hai, kahi bheji nahi jaati.

---

## Important note ⚠️

Full device control (apps kholna, tap/type/scroll, calls, SMS) ab
**real native code** se implement hai (`install-automation.sh` ke through) —
ye demo/fake nahi hai. Isko kaam karne ke liye har baar app khulne ke baad
Accessibility Service enabled honi chahiye (agar user disable kar de to
Zoya bol degi "accessibility service not enabled" aur normal chat/voice
mode me kaam karti rahegi).

**Zimmedari se use karo:** ek AI ko calls/messages/taps karne ki poori
permission dena powerful hai lekin risky bhi — agar koi banking/payment
app khula ho ya galat number confirm ho jaye to nuksaan ho sakta hai.
Jab bhi zaroorat na ho, Settings se Accessibility service ko off rakhna
safe practice hai.
