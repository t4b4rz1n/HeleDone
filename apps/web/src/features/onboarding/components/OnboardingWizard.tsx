import { t as translate, useTranslation } from "../../../i18n/locale";
import React from 'react';
import { Brand } from '../../../components/Brand';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { StepOrgDetails } from './StepOrgDetails';
import { StepAddUsers } from './StepAddUsers';
import { StepConfirm } from './StepConfirm';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, Users, CheckCircle2 } from 'lucide-react';

const steps = [
  { get label() { return translate("سازمان"); }, icon: Building2 },
  { get label() { return translate("هم‌تیمی‌ها"); }, icon: Users },
  { get label() { return translate("تأیید و شروع"); }, icon: CheckCircle2 },
];

export const OnboardingWizard: React.FC = () => {
  const t = useTranslation();
  const currentStep = useOnboardingStore((state) => state.currentStep);

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <StepOrgDetails />;
      case 2: return <StepAddUsers />;
      case 3: return <StepConfirm />;
      default: return <StepOrgDetails />;
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      {/* Brand Header */}
      <header className="mb-6 w-full max-w-4xl text-center flex flex-col items-center">
        <div className="flex justify-center">
          <Brand />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-base-content mt-4 tracking-tight">
          {t("وقت هماهنگ شدن است")}
        </h1>
        <p className="text-heledone-ink-muted text-sm sm:text-base mt-1.5 font-medium">
          {t("فضای کار تیم‌تان را در هله‌دان بسازید")}
        </p>
      </header>

      {/* Modern Stepper */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 mb-8 w-full max-w-xl px-4">
        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isActive = currentStep === stepNum;
          const isDone = currentStep > stepNum;
          const Icon = step.icon;
          return (
            <React.Fragment key={step.label}>
              <div className="flex items-center gap-2 sm:gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                    isDone
                      ? 'bg-success text-white shadow-xs'
                      : isActive
                      ? 'bg-primary text-white shadow-sm ring-4 ring-primary/15'
                      : 'bg-base-100 text-heledone-ink-muted border border-base-300'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`text-xs sm:text-sm font-bold transition-colors ${
                    isActive ? 'text-primary' : isDone ? 'text-base-content' : 'text-heledone-ink-muted'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 min-w-[20px] max-w-[48px] h-0.5 rounded-full transition-colors duration-500 ${
                    currentStep > stepNum ? 'bg-success' : 'bg-base-300'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="w-full max-w-4xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
