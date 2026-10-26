import * as THREE from 'three';
import * as xb from 'xrblocks';
import { CHARACTERS } from './characters.ts';
import {
  initAuth,
  testFirestoreConnection,
  submitScore,
  getTopLeaderboard,
  LeaderboardEntry,
} from './firebase.ts';
import { MaxFlizGameEngine } from './game.ts';
import { sound } from './sound.ts';
import { CharacterId } from './types.ts';

class MaxFlizScene extends xb.Script {
  private engine!: MaxFlizGameEngine;
  private selectedCharId: CharacterId = 'marcin';
  private selectedLevelId: number = 1;
  private lastScore: number = 0;
  private lastCoins: number = 0;
  private lastTimeSeconds: number = 0;
  private lastBossDefeated: boolean = false;

  init() {
    const camera = (xb.core.camera as THREE.PerspectiveCamera) || new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

    const hudHeroName = document.getElementById('hud-hero-name')!;
    const hudHeroRole = document.getElementById('hud-hero-role')!;
    const heroAvatar = document.getElementById('hero-avatar')!;
    const hudHpRow = document.getElementById('hud-hp-row')!;
    const hudScore = document.getElementById('hud-score')!;
    const hudVip = document.getElementById('hud-vip')!;
    const hudTimer = document.getElementById('hud-timer')!;
    const speechBubble = document.getElementById('speech-bubble')!;
    const speechBubbleText = document.getElementById('speech-bubble-text')!;
    const abilityName = document.getElementById('ability-name')!;
    const abilityCooldownOverlay = document.getElementById('ability-cooldown-overlay')!;
    const abilityIcon = document.getElementById('ability-icon')!;

    const titleScreen = document.getElementById('title-screen')!;
    const hudTop = document.getElementById('hud-top')!;
    const hudBottom = document.getElementById('hud-bottom')!;
    const touchControls = document.getElementById('touch-controls')!;
    const pauseModal = document.getElementById('pause-modal')!;
    const victoryModal = document.getElementById('victory-modal')!;
    const gameoverModal = document.getElementById('gameover-modal')!;

    const victoryScore = document.getElementById('victory-score')!;
    const victoryTime = document.getElementById('victory-time')!;
    const gameoverReason = document.getElementById('gameover-reason')!;

    // Boss Bar elements
    const bossHudBar = document.getElementById('boss-hud-bar');
    const bossNameElem = document.getElementById('boss-name');
    const bossHpTextElem = document.getElementById('boss-hp-text');
    const bossHpFillElem = document.getElementById('boss-hp-fill');

    // Perk HUD elements
    const perkBadgeShield = document.getElementById('perk-badge-shield');
    const perkBadgeJump = document.getElementById('perk-badge-jump');
    const perkJumpTimer = document.getElementById('perk-jump-timer');
    const perkBadgeMagnet = document.getElementById('perk-badge-magnet');
    const perkMagnetTimer = document.getElementById('perk-magnet-timer');
    const perkBadgeSpeed = document.getElementById('perk-badge-speed');
    const perkSpeedTimer = document.getElementById('perk-speed-timer');

    // Move renderer canvas into container if available
    const container = document.getElementById('game-canvas-container');
    if (container && xb.core.renderer && xb.core.renderer.domElement) {
      if (xb.core.renderer.domElement.parentElement !== container) {
        container.appendChild(xb.core.renderer.domElement);
      }
    }

    // Callbacks for engine updates
    this.engine = new MaxFlizGameEngine(
      this as unknown as THREE.Scene,
      camera,
      document.body,
      {
        onScoreUpdate: (score, collectedVip, totalVip) => {
          hudScore.textContent = score.toString();
          hudVip.textContent = `${collectedVip} / ${totalVip}`;
        },
        onHpUpdate: (hp, maxHp) => {
          hudHpRow.innerHTML = '';
          for (let i = 0; i < maxHp; i++) {
            const span = document.createElement('span');
            span.className = `hp-mug ${i < hp ? '' : 'lost'}`;
            span.textContent = '☕';
            hudHpRow.appendChild(span);
          }
        },
        onAbilityCooldown: (progress, ready) => {
          abilityCooldownOverlay.style.width = `${(1 - progress) * 100}%`;
          const btn = document.getElementById('btn-ability');
          if (btn) {
            btn.style.opacity = ready ? '1' : '0.6';
          }
        },
        onSpeechBubble: (text) => {
          if (!text) {
            speechBubble.classList.add('hidden');
          } else {
            speechBubbleText.textContent = text;
            speechBubble.classList.remove('hidden');
          }
        },
        onPerksUpdate: (perks) => {
          if (perkBadgeShield) {
            perkBadgeShield.classList.toggle('hidden', !perks.shield);
          }
          if (perkBadgeJump && perkJumpTimer) {
            if (perks.doubleJump > 0) {
              perkBadgeJump.classList.remove('hidden');
              perkJumpTimer.textContent = `${Math.ceil(perks.doubleJump)}s`;
            } else {
              perkBadgeJump.classList.add('hidden');
            }
          }
          if (perkBadgeMagnet && perkMagnetTimer) {
            if (perks.magnet > 0) {
              perkBadgeMagnet.classList.remove('hidden');
              perkMagnetTimer.textContent = `${Math.ceil(perks.magnet)}s`;
            } else {
              perkBadgeMagnet.classList.add('hidden');
            }
          }
          if (perkBadgeSpeed && perkSpeedTimer) {
            if (perks.speedBoost > 0) {
              perkBadgeSpeed.classList.remove('hidden');
              perkSpeedTimer.textContent = `${Math.ceil(perks.speedBoost)}s`;
            } else {
              perkBadgeSpeed.classList.add('hidden');
            }
          }
        },
        onLevelComplete: (levelId, score, timeStr) => {
          this.lastScore = score;
          this.lastCoins = this.engine.getCollectedVipCount();
          this.lastTimeSeconds = this.engine.getElapsedSeconds();
          this.lastBossDefeated = this.engine.isBossDefeated();

          victoryScore.textContent = score.toString();
          victoryTime.textContent = timeStr;
          victoryModal.classList.remove('hidden');
          hudTop.classList.add('hidden');
          hudBottom.classList.add('hidden');
          touchControls.classList.add('hidden');
          bossHudBar?.classList.add('hidden');

          // Reset Victory Submission Form
          const nickInput = document.getElementById('player-nickname-input') as HTMLInputElement | null;
          const submitBtn = document.getElementById('btn-submit-score') as HTMLButtonElement | null;
          const feedbackMsg = document.getElementById('submit-feedback-msg');
          if (nickInput) {
            const savedNick = localStorage.getItem('maxfliz_player_nick');
            nickInput.value = savedNick || `Kierownik ${CHARACTERS[this.selectedCharId].name}`;
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '💾 ZAPISZ';
          }
          if (feedbackMsg) {
            feedbackMsg.className = 'submit-feedback hidden';
            feedbackMsg.textContent = '';
          }
        },
        onGameOver: (reason) => {
          gameoverReason.textContent = reason;
          gameoverModal.classList.remove('hidden');
          hudTop.classList.add('hidden');
          hudBottom.classList.add('hidden');
          touchControls.classList.add('hidden');
          bossHudBar?.classList.add('hidden');
        },
        onBossUpdate: (name, hp, maxHp, visible) => {
          if (!bossHudBar || !bossNameElem || !bossHpTextElem || !bossHpFillElem) return;
          if (visible && hp > 0) {
            bossHudBar.classList.remove('hidden');
            bossNameElem.textContent = `👔 ${name}`;
            bossHpTextElem.textContent = `${hp} / ${maxHp}`;
            bossHpFillElem.style.width = `${(hp / maxHp) * 100}%`;
          } else {
            bossHudBar.classList.add('hidden');
          }
        },
      }
    );

    // Initial character sync
    const updateCharacterUI = (id: CharacterId) => {
      this.selectedCharId = id;
      const def = CHARACTERS[id];
      hudHeroName.textContent = def.name;
      hudHeroRole.textContent = def.role;
      abilityName.textContent = def.abilityName;

      const avatarIcons: Record<CharacterId, string> = {
        marcin: '👷‍♂️',
        grzesiek: '🚜',
        dawid: '💪',
        mateusz: '☕',
        piotr: '👨‍🔧',
      };
      const abilityIcons: Record<CharacterId, string> = {
        marcin: '📜',
        grzesiek: '⚡',
        dawid: '🧱',
        mateusz: '☕',
        piotr: '🛠️',
      };
      heroAvatar.textContent = avatarIcons[id];
      abilityIcon.textContent = abilityIcons[id] || '⚡';

      const attackNameElem = document.getElementById('attack-name');
      const attackIconElem = document.getElementById('attack-icon');
      const attackNames: Record<CharacterId, string> = {
        marcin: 'Cios Segregatorem',
        grzesiek: 'Łata Brukarska',
        dawid: 'Przecinak do Gresu',
        mateusz: 'Chluśnięcie Espresso',
        piotr: 'Poziomica Laserowa',
      };
      const attackIcons: Record<CharacterId, string> = {
        marcin: '🥊',
        grzesiek: '🔨',
        dawid: '🔪',
        mateusz: '☕',
        piotr: '📐',
      };
      if (attackNameElem) attackNameElem.textContent = attackNames[id] || 'Atak';
      if (attackIconElem) attackIconElem.textContent = attackIcons[id] || '🥊';

      const detailTitle = document.getElementById('char-detail-title');
      const detailBio = document.getElementById('char-detail-bio');
      const detailSkill = document.getElementById('char-detail-skill');
      if (detailTitle && detailBio && detailSkill) {
        detailTitle.textContent = `${def.name} – ${def.title}`;
        detailBio.textContent = def.bio;
        detailSkill.innerHTML = `<strong>Umiejętność:</strong> ${def.abilityName} – ${def.abilityDescription}`;
      }

      // Update Numerical Stat Bars
      const statBarSpeed = document.getElementById('stat-bar-speed');
      const statValSpeed = document.getElementById('stat-val-speed');
      const statBarJump = document.getElementById('stat-bar-jump');
      const statValJump = document.getElementById('stat-val-jump');
      const statBarPower = document.getElementById('stat-bar-power');
      const statValPower = document.getElementById('stat-val-power');
      const statBarDefense = document.getElementById('stat-bar-defense');
      const statValDefense = document.getElementById('stat-val-defense');

      if (statBarSpeed && statValSpeed) {
        statBarSpeed.style.width = `${(def.stats.speed / 5) * 100}%`;
        statValSpeed.textContent = `${def.stats.speed} / 5`;
      }
      if (statBarJump && statValJump) {
        statBarJump.style.width = `${(def.stats.jump / 5) * 100}%`;
        statValJump.textContent = `${def.stats.jump} / 5`;
      }
      if (statBarPower && statValPower) {
        statBarPower.style.width = `${(def.stats.power / 5) * 100}%`;
        statValPower.textContent = `${def.stats.power} / 5`;
      }
      if (statBarDefense && statValDefense) {
        statBarDefense.style.width = `${(def.stats.defense / 5) * 100}%`;
        statValDefense.textContent = `${def.stats.defense} / 5`;
      }

      this.engine.selectCharacter(id);
    };

    updateCharacterUI('marcin');

    // Firebase Leaderboard Rendering
    const leaderboardLoading = document.getElementById('leaderboard-loading');
    const leaderboardList = document.getElementById('leaderboard-list');

    const renderLeaderboard = async () => {
      if (!leaderboardLoading || !leaderboardList) return;
      leaderboardLoading.classList.remove('hidden');
      leaderboardLoading.textContent = 'Ładowanie rankingu z chmury Firebase...';
      leaderboardList.classList.add('hidden');
      leaderboardList.innerHTML = '';

      try {
        const topScores = await getTopLeaderboard(15);
        leaderboardLoading.classList.add('hidden');
        leaderboardList.classList.remove('hidden');

        if (topScores.length === 0) {
          leaderboardList.innerHTML = `
            <div class="leaderboard-status-msg">
              Brak jeszcze wyników na tej zmianie! Bądź pierwszym magazynierem, który załaduje zamówienie VIP i zapisze wynik.
            </div>
          `;
          return;
        }

        topScores.forEach((entry, idx) => {
          const rankIcons = ['🥇', '🥈', '🥉'];
          const rankDisplay = idx < 3 ? rankIcons[idx] : `${idx + 1}.`;
          const heroIcons: Record<string, string> = {
            Marcin: '👷‍♂️',
            Grzesiek: '🚜',
            Dawid: '💪',
            Mateusz: '☕',
          };
          const heroIcon = heroIcons[entry.hero] || '👷‍♂️';
          const bossBadge = entry.bossDefeated ? '<span title="Były Kierownik Walczak skasowany!">👔💥</span>' : '';
          const mins = Math.floor(entry.timeSeconds / 60);
          const secs = entry.timeSeconds % 60;
          const timeFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

          const row = document.createElement('div');
          row.className = `leaderboard-item ${idx === 0 ? 'top-1' : ''}`;
          row.innerHTML = `
            <div class="leaderboard-rank">${rankDisplay}</div>
            <div class="leaderboard-hero-tag">${heroIcon}</div>
            <div class="leaderboard-player-info">
              <div class="leaderboard-player-name">${entry.playerName} ${bossBadge}</div>
              <div class="leaderboard-player-meta">${entry.hero} • Czas: ${timeFormatted} • VIP: ${entry.coins}</div>
            </div>
            <div class="leaderboard-score-cluster">
              <div class="leaderboard-score-val">${entry.score} pkt</div>
            </div>
          `;
          leaderboardList.appendChild(row);
        });
      } catch (err) {
        leaderboardLoading.classList.remove('hidden');
        leaderboardLoading.textContent = 'Nie udało się pobrać rankingu. Sprawdź połączenie z bazą Firebase.';
        console.warn('Leaderboard error:', err);
      }
    };

    // Refresh Leaderboard Button
    document.getElementById('btn-refresh-leaderboard')?.addEventListener('click', () => {
      renderLeaderboard();
    });

    // Menu Tab Navigation Handlers
    document.querySelectorAll('.menu-tab-btn').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        document.querySelectorAll('.menu-tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        tabBtn.classList.add('active');
        const targetId = tabBtn.getAttribute('data-tab');
        if (targetId) {
          document.getElementById(targetId)?.classList.add('active');
          if (targetId === 'tab-leaderboard') {
            renderLeaderboard();
          }
        }
      });
    });

    // Character Selection Click Handlers
    document.querySelectorAll('.char-card').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.char-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        const charId = card.getAttribute('data-char') as CharacterId;
        if (charId) {
          updateCharacterUI(charId);
        }
      });
    });

    // Perk Shop Activation Buttons
    document.querySelectorAll('.btn-perk-activate').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const btnEl = e.currentTarget as HTMLElement;
        const perkId = btnEl.getAttribute('data-perk') as 'hardhat' | 'vibram_boots' | 'order_magnet' | 'espresso_boost';
        if (perkId) {
          this.engine.activatePerk(perkId);
          const originalText = btnEl.textContent || 'AKTYWUJ';
          btnEl.textContent = 'AKTYWNY! ✅';
          btnEl.classList.add('activated');
          setTimeout(() => {
            btnEl.textContent = originalText;
            btnEl.classList.remove('activated');
          }, 3500);
        }
      });
    });

    // Zone Selection Card Handlers
    document.querySelectorAll('.zone-card').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.zone-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedLevelId = parseInt(card.getAttribute('data-level') || '1', 10);
      });
    });

    // Start Game Action
    const doStartGame = () => {
      titleScreen.classList.add('hidden');
      pauseModal.classList.add('hidden');
      victoryModal.classList.add('hidden');
      gameoverModal.classList.add('hidden');

      hudTop.classList.remove('hidden');
      hudBottom.classList.remove('hidden');

      // Always show touch controls on mobile or touch displays
      touchControls.classList.remove('hidden');

      this.engine.startGame(this.selectedLevelId);
    };

    const startBtn = document.getElementById('btn-start-game');
    startBtn?.addEventListener('click', doStartGame);
    startBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      doStartGame();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!titleScreen.classList.contains('hidden')) {
        if (e.code === 'Enter' || e.code === 'Space') {
          doStartGame();
          e.preventDefault();
        }
      }
    });

    // HUD Attack Button
    document.getElementById('btn-attack')?.addEventListener('click', () => {
      this.engine.triggerAttack();
    });

    // HUD Ability Button
    document.getElementById('btn-ability')?.addEventListener('click', () => {
      this.engine.triggerAbility();
    });

    // Top Quick Controls
    document.getElementById('btn-top-camera')?.addEventListener('click', () => {
      this.engine.toggleCameraMode();
    });

    const topSoundIcon = document.getElementById('top-sound-icon');
    const soundIcon = document.getElementById('sound-icon');
    const handleSoundToggle = () => {
      const isMuted = sound.toggleMute();
      const icon = isMuted ? '🔇' : '🔊';
      if (topSoundIcon) topSoundIcon.textContent = icon;
      if (soundIcon) soundIcon.textContent = icon;
    };
    document.getElementById('btn-top-sound')?.addEventListener('click', handleSoundToggle);
    document.getElementById('btn-sound')?.addEventListener('click', handleSoundToggle);

    const handlePause = () => {
      this.engine.togglePause();
      pauseModal.classList.remove('hidden');
    };
    document.getElementById('btn-top-pause')?.addEventListener('click', handlePause);
    document.getElementById('btn-pause')?.addEventListener('click', handlePause);

    // Story Modal Logic
    const storyModal = document.getElementById('story-intro-modal');
    const btnOpenStory = document.getElementById('btn-open-story-modal');
    const btnCloseStory = document.getElementById('btn-close-story');
    const btnStoryPrev = document.getElementById('btn-story-prev') as HTMLButtonElement | null;
    const btnStoryNext = document.getElementById('btn-story-next') as HTMLButtonElement | null;
    const btnStoryPlay = document.getElementById('btn-story-play');
    const storySlides = document.querySelectorAll('.story-slide');
    const storyDots = document.querySelectorAll('.story-progress-dots .dot');
    let currentSlide = 0;

    const updateStorySlides = (index: number) => {
      currentSlide = Math.max(0, Math.min(index, storySlides.length - 1));
      storySlides.forEach((slide, i) => {
        if (i === currentSlide) {
          slide.classList.remove('hidden');
          slide.classList.add('active');
        } else {
          slide.classList.add('hidden');
          slide.classList.remove('active');
        }
      });
      storyDots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
      });

      if (btnStoryPrev) btnStoryPrev.disabled = currentSlide === 0;
      if (btnStoryNext && btnStoryPlay) {
        if (currentSlide === storySlides.length - 1) {
          btnStoryNext.classList.add('hidden');
          btnStoryPlay.classList.remove('hidden');
        } else {
          btnStoryNext.classList.remove('hidden');
          btnStoryPlay.classList.add('hidden');
        }
      }
    };

    btnOpenStory?.addEventListener('click', () => {
      storyModal?.classList.remove('hidden');
      updateStorySlides(0);
    });

    btnCloseStory?.addEventListener('click', () => {
      storyModal?.classList.add('hidden');
    });

    btnStoryPrev?.addEventListener('click', () => {
      updateStorySlides(currentSlide - 1);
    });

    btnStoryNext?.addEventListener('click', () => {
      updateStorySlides(currentSlide + 1);
    });

    btnStoryPlay?.addEventListener('click', () => {
      storyModal?.classList.add('hidden');
      doStartGame();
    });

    storyDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const slideIdx = parseInt(dot.getAttribute('data-slide') || '0', 10);
        updateStorySlides(slideIdx);
      });
    });

    // Camera Switcher
    document.getElementById('btn-camera')?.addEventListener('click', () => {
      this.engine.toggleCameraMode();
    });

    // HUD Attack & Ability Buttons
    document.getElementById('btn-attack')?.addEventListener('click', () => {
      this.engine.triggerAttack();
    });

    document.getElementById('btn-ability')?.addEventListener('click', () => {
      this.engine.triggerAbility();
    });

    // Resume button
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      pauseModal.classList.add('hidden');
      this.engine.togglePause();
    });

    // Restart in Pause
    document.getElementById('btn-restart-pause')?.addEventListener('click', () => {
      pauseModal.classList.add('hidden');
      this.engine.startGame(this.selectedLevelId);
    });

    // Return to Menu in Pause
    document.getElementById('btn-menu-pause')?.addEventListener('click', () => {
      pauseModal.classList.add('hidden');
      hudTop.classList.add('hidden');
      hudBottom.classList.add('hidden');
      touchControls.classList.add('hidden');
      titleScreen.classList.remove('hidden');
      this.engine.startTitle();
    });

    // Victory Next Level
    document.getElementById('btn-next-level')?.addEventListener('click', () => {
      victoryModal.classList.add('hidden');
      hudTop.classList.remove('hidden');
      hudBottom.classList.remove('hidden');
      touchControls.classList.remove('hidden');
      this.selectedLevelId = (this.selectedLevelId % 3) + 1;
      this.engine.startGame(this.selectedLevelId);
    });

    // Victory Replay
    document.getElementById('btn-replay-level')?.addEventListener('click', () => {
      victoryModal.classList.add('hidden');
      hudTop.classList.remove('hidden');
      hudBottom.classList.remove('hidden');
      touchControls.classList.remove('hidden');
      this.engine.startGame(this.selectedLevelId);
    });

    // Victory to Menu
    document.getElementById('btn-menu-victory')?.addEventListener('click', () => {
      victoryModal.classList.add('hidden');
      titleScreen.classList.remove('hidden');
      this.engine.startTitle();
    });

    // Game Over Retry
    document.getElementById('btn-retry')?.addEventListener('click', () => {
      gameoverModal.classList.add('hidden');
      hudTop.classList.remove('hidden');
      hudBottom.classList.remove('hidden');
      touchControls.classList.remove('hidden');
      this.engine.startGame(this.selectedLevelId);
    });

    // Game Over to Menu
    document.getElementById('btn-menu-gameover')?.addEventListener('click', () => {
      gameoverModal.classList.add('hidden');
      titleScreen.classList.remove('hidden');
      this.engine.startTitle();
    });

    // Victory High Score Submit Button
    const submitBtn = document.getElementById('btn-submit-score') as HTMLButtonElement | null;
    const nickInput = document.getElementById('player-nickname-input') as HTMLInputElement | null;
    const feedbackMsg = document.getElementById('submit-feedback-msg');

    submitBtn?.addEventListener('click', async () => {
      const playerName = nickInput?.value.trim() || `Kierownik ${CHARACTERS[this.selectedCharId].name}`;
      localStorage.setItem('maxfliz_player_nick', playerName);

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ ZAPISYWANIE...';
      if (feedbackMsg) {
        feedbackMsg.className = 'submit-feedback';
        feedbackMsg.textContent = 'Wysyłanie wyniku do Firebase Firestore...';
        feedbackMsg.classList.remove('hidden');
      }

      try {
        await submitScore({
          playerName,
          hero: CHARACTERS[this.selectedCharId].name,
          score: this.lastScore,
          coins: this.lastCoins,
          timeSeconds: this.lastTimeSeconds,
          bossDefeated: this.lastBossDefeated,
        });

        submitBtn.textContent = '✅ ZAPISANO!';
        if (feedbackMsg) {
          feedbackMsg.className = 'submit-feedback success';
          feedbackMsg.textContent = '🎉 Sukces! Wynik pomyślnie zapisany w rankingu Firebase!';
        }
        renderLeaderboard();
      } catch (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'RETRY 💾';
        if (feedbackMsg) {
          feedbackMsg.className = 'submit-feedback error';
          feedbackMsg.textContent = 'Błąd zapisu w Firebase. Spróbuj ponownie!';
        }
      }
    });

    // Background Firebase init & warm up
    initAuth().catch(console.warn);
    testFirestoreConnection().catch(console.warn);
    renderLeaderboard();

    // Setup Touch Virtual Joystick
    this.setupTouchControls();

    // Start title cinematic & automatically launch animated story intro on first load
    this.engine.startTitle();
    if (storyModal) {
      storyModal.classList.remove('hidden');
      updateStorySlides(0);
    }
  }

  private setupTouchControls() {
    const joystickZone = document.getElementById('touch-joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');
    if (!joystickZone || !joystickBase || !joystickKnob) return;

    let touchId: number | null = null;
    let startX = 0;
    let startY = 0;
    const maxRadius = 45;

    const resetJoystick = () => {
      touchId = null;
      joystickBase.classList.remove('active');
      joystickKnob.style.transform = 'translate(0px, 0px)';
      this.engine.setVirtualInput(0, 0);
    };

    const onStart = (e: TouchEvent) => {
      if (touchId !== null) return;
      if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;

        joystickBase.style.left = `${startX}px`;
        joystickBase.style.top = `${startY}px`;
        joystickBase.classList.add('active');
        joystickKnob.style.transform = 'translate(0px, 0px)';
        if (e.cancelable) e.preventDefault();
      }
    };

    const onMove = (e: TouchEvent) => {
      if (touchId === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === touchId) {
          const dx = touch.clientX - startX;
          const dy = touch.clientY - startY;
          const dist = Math.hypot(dx, dy);
          const clampedDist = Math.min(dist, maxRadius);
          const angle = Math.atan2(dy, dx);

          const nx = Math.cos(angle) * clampedDist;
          const ny = Math.sin(angle) * clampedDist;

          joystickKnob.style.transform = `translate(${nx}px, ${ny}px)`;
          this.engine.setVirtualInput(nx / maxRadius, ny / maxRadius);
          if (e.cancelable) e.preventDefault();
          break;
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (touchId === null) return;
      let stillActive = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchId) {
          stillActive = true;
          break;
        }
      }
      if (!stillActive) {
        resetJoystick();
      }
    };

    joystickZone.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', resetJoystick, { passive: true });
    window.addEventListener('blur', resetJoystick);

    // Touch Action Buttons
    const attackBtn = document.getElementById('btn-touch-attack');
    attackBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.triggerAttack();
    }, { passive: false });

    const jumpBtn = document.getElementById('btn-touch-jump');
    jumpBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    }, { passive: false });
    jumpBtn?.addEventListener('touchend', (e) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    }, { passive: false });

    const abilityBtn = document.getElementById('btn-touch-ability');
    abilityBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.triggerAbility();
    }, { passive: false });
  }

  update() {
    const dt = xb.getDeltaTime();
    if (this.engine) {
      this.engine.update(dt);
    }
  }

  onSelectEnd(event: xb.SelectEvent) {
    this.engine?.triggerAbility();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.setAppTitle('Max-Fliz Magazyn Showdown 3D');
  options.setAppDescription('Trójwymiarowa platformówka izometryczna w szalonym magazynie firmy Max-Fliz.');
  options.reticles.enabled = false;
  if ((options as any).xrButton) {
    (options as any).xrButton.showEnterSimulatorButton = false;
  }

  xb.add(new MaxFlizScene());
  await xb.init(options);

  // Configure high-definition rendering (Poco F6 / 120Hz / retina displays)
  if (xb.core.renderer) {
    const webglRenderer = xb.core.renderer as THREE.WebGLRenderer;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    if (typeof webglRenderer.setPixelRatio === 'function') {
      webglRenderer.setPixelRatio(dpr);
    }
    if ('toneMapping' in webglRenderer) {
      webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      webglRenderer.toneMappingExposure = 1.15;
    }
    if (webglRenderer.shadowMap) {
      webglRenderer.shadowMap.enabled = true;
      webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }

  // Ensure any injected XR button overlay doesn't block screen
  const xrWrapper = document.getElementById('XRButtonWrapper');
  if (xrWrapper) {
    xrWrapper.style.display = 'none';
  }
});
