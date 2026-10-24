import { useTranslation } from "../../../i18n/locale";
import { motion } from "motion/react";
import { ProfileEditForm } from "../components/ProfileEditForm";
import { PageHeading } from "../../../components/PageHeading";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { y: 15, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

const ProfilePage = () => {
  const t = useTranslation();
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="bg-transparent min-h-[calc(100dvh-121px)] max-w-6xl mx-auto space-y-5"
    >
      <PageHeading title={t("Account Settings")} description={t("Manage your personal information, account security, and notification preferences.")} illustration="coastal-house" />
      <motion.div variants={itemVariants}>
        <ProfileEditForm />
      </motion.div>
    </motion.div>
  );
};

export default ProfilePage;
