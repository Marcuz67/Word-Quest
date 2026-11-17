# Word Trail — Grade 8 vocabulary game

Word Trail is a phone-friendly, offline-capable vocabulary game prototype. It uses the supplied 150-question word-definition bank, grouped as 50 questions in each of three stages, and adds companion prompts for context clues and sentence building.

## Game flow

- Each stage’s first quiz selects 20 randomized questions from that stage’s 50-question bank and balances word definition, context clues, and sentence building.
- Learners choose an answer and confirm it before scoring. The app immediately shows the correct answer and meaning.
- At 10 correct answers, a pop-up offers to advance or continue the quiz. Advancing pauses the quiz and saves the learner’s place. If they have fewer than 10 correct, they can advance after answering all 20 questions.
- The first 20-question quiz sets the stage’s official score. Later practice can use unanswered questions from the bank, but answered questions never appear again and practice cannot change the official score.
- Answer review puts incorrect answers first and highlights them in red. There is no separate missed-word retry menu.
- On first launch, a teacher creates a local teacher account. Teachers can add learner profiles; students can sign in with a teacher-provided profile or create their own account. Students cannot add profiles while signed in.
- Students can log out. Teacher and learner access is local to this device; there is no online account service.
- Level-up notices animate in at the top right. Overall progress is shown as levels 1–10, with each level representing 10% across all three stages.
- The theme switch sits just left of the learner account pill at the top right. The light theme uses a bright neon-green gradient background, navy-blue glass cards with cartoon outlines, and bright blue interaction highlights; dark mode uses deep green and light green.
- Progress is stored locally and is set to expire after 180 days by default. Learners can change the date or reset their scores in Progress.

## Open the prototype

Open index.html in a current desktop browser for a local preview. Progress is saved in that browser on that device.

For offline installation from Android Chrome, serve the folder from an HTTPS address, open it in Chrome, and choose **Install app** from the browser menu. Browser offline installation requires a secure web address.

## APK status

This folder includes a native Android WebView wrapper in the android subfolder, with the app bundled locally for offline play. The installable debug APK is WordTrail.apk in this folder.

To install it directly on an Android phone, download WordTrail.apk to the phone, open the downloaded file, allow installation from that source if Android asks, and tap Install. The game works offline after installation. Learner accounts and scores stay on that device and do not sync to other phones.

The Android project is pinned to Android Gradle Plugin 9.5.1 and Gradle 9.6.0, and requests Android SDK Platform 35. Open the android subfolder in a current Android Studio installation to sync and build an APK. A command-line build also needs a Java 17 or newer runtime and the Android SDK packages. On Windows, set ANDROID_HOME to the SDK folder and run android/build-apk.ps1. The script copies the debug APK into this folder.

## Files

- index.html, styles.css, app.js — app screens and game mechanics
- questions.json, questions.js — supplied question bank and answer key
- contexts.js — context clue and sentence examples
- android — native Android wrapper project and bundled app assets
- manifest.webmanifest, service-worker.js, icon.svg — installable offline web-app shell
