/**
 * LoadingMixin - InspectorModal loading indicator animation & step queue.
 *
 * Extracted from inspector.js via Object.assign prototype composition.
 * NOTE: original private fields (#xxx) were converted to public (_xxx) so
 * mixin methods (defined outside the class body) can access them.
 */
export const LoadingMixin = {
    showLoading(show, resetSteps = true, showSteps = true) {
        if (!this._loadingEl) return;

        if (show) {
            this._loadingEl.classList.remove('hidden');
            const stepsEl = this._loadingEl.querySelector('.inspector-loading-steps');
            if (stepsEl) {
                stepsEl.style.display = showSteps ? '' : 'none';
            }
            if (resetSteps) {
                this._resetLoadingSteps();
            }
            if (this._refreshBtn) this._refreshBtn.disabled = true;
        } else {
            this._stopLoadingAnimation();
            this._loadingEl.classList.add('hidden');
            const stepsEl = this._loadingEl.querySelector('.inspector-loading-steps');
            if (stepsEl) {
                stepsEl.style.display = '';
            }
            if (this._refreshBtn) this._refreshBtn.disabled = false;
        }
    },

    _resetLoadingSteps() {
        this._stepGeneration++;
        this._loadingStepIndex = 0;
        this._stepQueue = [];
        this._stepProcessing = false;
        this._lastStepTime = 0;
        const steps = this._loadingEl.querySelectorAll('.inspector-loading-step');
        if (steps.length === 0) return;
        steps.forEach(s => {
            s.classList.remove('active', 'done');
        });
        steps[0].classList.add('active');
        this._lastStepTime = Date.now();
    },

    _advanceLoadingStep(targetStep) {
        const pendingTarget = this._stepQueue.length > 0 ? this._stepQueue[this._stepQueue.length - 1] : this._loadingStepIndex;
        if (targetStep <= pendingTarget) return;
        for (let i = pendingTarget + 1; i <= targetStep; i++) {
            this._stepQueue.push(i);
        }
        this._processStepQueue();
    },

    async _processStepQueue() {
        if (this._stepProcessing) return;
        this._stepProcessing = true;
        const gen = this._stepGeneration;

        while (this._stepQueue.length > 0) {
            if (this._stepGeneration !== gen) { this._stepProcessing = false; return; }
            const nextStep = this._stepQueue.shift();
            const elapsed = Date.now() - this._lastStepTime;
            const minDelay = 600;

            if (elapsed < minDelay) {
                await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
            }

            if (this._stepGeneration !== gen) { this._stepProcessing = false; return; }

            const steps = this._loadingEl?.querySelectorAll('.inspector-loading-step');
            if (!steps || steps.length === 0) break;

            if (this._loadingStepIndex < steps.length) {
                steps[this._loadingStepIndex].classList.remove('active');
                steps[this._loadingStepIndex].classList.add('done');
            }

            if (nextStep < steps.length) {
                steps[nextStep].classList.add('active');
            } else {
                for (let i = this._loadingStepIndex + 1; i < steps.length; i++) {
                    steps[i].classList.remove('active');
                    steps[i].classList.add('done');
                }
            }

            this._loadingStepIndex = nextStep;
            this._lastStepTime = Date.now();
        }

        this._stepProcessing = false;
    },

    _subscribeProgress() {
        this._unsubscribeProgress();
        if (window.electronAPI?.inspector?.onProgress) {
            this._progressUnsubscribe = window.electronAPI.inspector.onProgress((stage) => {
                const stageMap = {
                    'appium-starting': 0,
                    'appium-started': 1,
                    'session-creating': 2,
                    'session-created': 3
                };
                const stepIndex = stageMap[stage];
                if (stepIndex !== undefined) {
                    this._advanceLoadingStep(stepIndex);
                }
            });
        }
    },

    _unsubscribeProgress() {
        if (this._progressUnsubscribe) {
            this._progressUnsubscribe();
            this._progressUnsubscribe = null;
        }
    },

    async _waitForStepQueue() {
        while (this._stepProcessing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    },

    _startLoadingAnimation() {
        this._resetLoadingSteps();
    },

    _stopLoadingAnimation() {
        if (this._loadingTimer) {
            clearInterval(this._loadingTimer);
            this._loadingTimer = null;
        }
    },
};
