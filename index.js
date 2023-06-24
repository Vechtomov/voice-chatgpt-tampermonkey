// ==UserScript==
// @name         Voice ChatGPT
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Voice ChatGPT
// @author       Vechtomov
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  document.executed = new Set();

  function addScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.executed.has(src)) {
        resolve();
        return;
      }
      const scriptEl = document.createElement("script");
      scriptEl.type = "text/javascript";
      scriptEl.src = src;
      scriptEl.charset = "utf-8";
      scriptEl.onload = resolve;
      document.head.appendChild(scriptEl);
    });
  }

  const raiseEvent = (target, event) => {
    target.dispatchEvent(new Event(event, {
      bubbles: !0,
      cancelable: !0
    }))
  }

  let mutationNodes = [];
  const x = ["P", "LI", "OL", "UL"];
  const F = (a) => {
    let e;
    return e = "none" !== getComputedStyle(a, "::after").content,
      e || (e = "none" !== getComputedStyle(a.parentElement, "::after").content),
      e
  }

  let startSpeaking = false, currentASREnabled = false, speakSentenseKeys = [];

  function onMutation(mutationsList, speechApp) {
    mutationsList.forEach((({ target: a }) => {
      if (3 === a.nodeType) {
        const { parentElement: n } = a;
        n && !mutationNodes.includes(n) && x.includes(n.tagName) && n.closest(".whitespace-pre-wrap") && F(n) && mutationNodes.push(n)
      }
    }
    )),
      mutationNodes.forEach((a => {
        if (document.contains(a)) {
          if (!F(a)) {
            mutationNodes.splice(mutationNodes.indexOf(a), 1);
            const text = a.textContent.trim();
            if (text && speechApp && speechApp.voiceEnabled) {
              if (!startSpeaking) {
                currentASREnabled = speechApp.speechRecognitionEnabled;
                speechApp.speechRecognitionEnabled = false;
                startSpeaking = true;
              }

              const sentenseKey = Symbol();
              speakSentenseKeys.push(sentenseKey);

              speechApp.speak(text, () => {
                speakSentenseKeys.splice(speakSentenseKeys.indexOf(sentenseKey), 1);
                if (speakSentenseKeys.length === 0) {
                  speechApp.speechRecognitionEnabled = currentASREnabled;
                  startSpeaking = false;
                }
              });
            }
          }
        } else
          mutationNodes.splice(mutationNodes.indexOf(a), 1)
      }
      ))
  }

  class SpeechAppConfigurator {
    speechApp = null;

    create = ({ sendMessage, microSelector, voicesSelector, cancelSpeechSelector, textAreaSelector, enableVoiceSelector }) => {
      const speechApp = new VoiceChatGPT.SpeechApp(sendMessage);

      speechApp.addEventListener(VoiceChatGPT.SpeechAppEvents.VoicesInitialized, () => {
        const voicesBox = document.querySelector(voicesSelector);
        if (!voicesBox) return;

        voicesBox.innerHTML = "";
        speechApp.voices.forEach((voice) => {
          const newOption = document.createElement("option");
          newOption.value = voice.voiceURI;
          newOption.text = voice.name;
          newOption.selected = voice.voiceURI === speechApp.selectedVoiceUri;
          voicesBox.appendChild(newOption);
        });

        voicesBox.addEventListener("change", (ev) => {
          speechApp.setVoice(ev.target.value);
        });
      });

      speechApp.addEventListener(VoiceChatGPT.SpeechAppEvents.MessageChanged, () => {
        const textArea = document.querySelector(textAreaSelector);
        textArea.value = speechApp.message;
        raiseEvent(textArea, "input");
      })

      document.querySelector(microSelector).addEventListener("click", (ev) => {
        ev.preventDefault();
        const microBtn = ev.target;
        const isEnabled = !speechApp.speechRecognitionEnabled;
        speechApp.speechRecognitionEnabled = isEnabled;
        if (isEnabled) {
          microBtn.innerText = "OFF micro";
        } else {
          microBtn.innerText = "ON micro";
        }
      });

      document.querySelector(enableVoiceSelector).addEventListener("click", (ev) => {
        ev.preventDefault();
        const target = ev.target;
        const isEnabled = !speechApp.voiceEnabled;
        speechApp.voiceEnabled = isEnabled;
        if (isEnabled) {
          target.innerText = "OFF voice";
        } else {
          target.innerText = "ON voice";
        }
      });

      document.querySelector(cancelSpeechSelector).addEventListener("click", (ev) => {
        ev.preventDefault();
        speechApp.cancelSpeech();
      });

      this.speechApp = speechApp;

      return this.speechApp;
    }
  }

  const getMessagesAreaNode = () => document.querySelector("main > div.flex-1 > div > div > div");

  const getFormNode = () => document.querySelector("form > div");

  const getVoiceSettingsNode = () => document.querySelector("#voice_settings");

  const setupSpeechApp = () => {
    const form = getFormNode();
    if (!form) return () => { };

    const settings = document.createElement("div");
    settings.innerHTML = `<div id="voice_settings" class="flex items-center gap-5">
      <span><button id="micro" class="py-1 px-2 rounded-md border">Turn on micro</button></span>
      <span><button id="voice" class="py-1 px-2 rounded-md border">Turn off voice</button></span>
      <span>Voices: <select id="voices" style="color: black"></select></span>
      <span><button id="cancel_speech" class="py-1 px-2 rounded-md border">Cancel speech</button></span>
      </div>`
    form.appendChild(settings);

    const configurator = new SpeechAppConfigurator();
    let speechApp;
    const sendMessage = (message) => {
      const sendBtn = document.querySelector("form *:has(> textarea) > button");
      if (sendBtn)
        sendBtn.click();
    }

    speechApp = configurator.create({
      sendMessage,
      microSelector: "#micro",
      voicesSelector: "#voices",
      cancelSpeechSelector: "#cancel_speech",
      enableVoiceSelector: "#voice",
      textAreaSelector: "form textarea"
    });
    speechApp.start();
    mutationNodes = [];
    const messagesObserver = new MutationObserver((mutationsList) => onMutation(mutationsList, speechApp));
    messagesObserver.observe(document, { attributes: false, childList: true, characterData: true, subtree: true });

    return () => {
      speechApp.stop();
      messagesObserver.disconnect();
    }
  };

  let reset = () => { };

  const scriptName = "https://github.com/Vechtomov/voice-chatgpt-tampermonkey/releases/download/v0.0.2-alpha/voice-chatgpt.js";
  addScript(scriptName).then(() => { document.executed.add(scriptName) });

  setInterval(() => {
    try {
      if (!document.executed.has(scriptName)) return;

      const setupNeeded = getMessagesAreaNode() && getFormNode() && !getVoiceSettingsNode();
      if (setupNeeded) {
        reset();
        reset = setupSpeechApp();
      }
    }
    catch (err) { }
  }, 100);
})();