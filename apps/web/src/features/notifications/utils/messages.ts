import { t } from "../../../i18n/locale";
import type { Notification } from "../types";

const messages = [
  {
    event: "project_created",
    source: "You have been added to a new project! You were added by {creator_name} to project {project_name}. Good luck!",
    key: "{creator_name} added you to {project_name}. Welcome aboard!",
  },
  {
    event: "project_member_removed",
    source: "You have been removed from a project! Your access to project {project_name} was revoked by {remover_name}.",
    key: "{remover_name} removed your access to {project_name}. Reach out to your team if you have questions.",
  },
  {
    event: "project_over_budget",
    source: "Budget warning! The budget for project {project_name} is running low or has been exceeded. Please review.",
    key: "The budget for {project_name} is running low or has been exceeded. Let's take a look.",
  },
  {
    event: "milestone_approaching",
    source: "Deadline approaching! Less than 48 hours remain until milestone {milestone_title} in project {project_name}.",
    key: "Less than 48 hours to go for {milestone_title} in {project_name}. Let's check in on progress.",
  },
  {
    event: "milestone_completed",
    source: "Milestone completed! Milestone {milestone_title} in project {project_name} has been successfully completed. Great job!",
    key: "{milestone_title} in {project_name} is done. Great work, team!",
  },
  {
    event: "task_assigned",
    source: "A new task has been assigned to you! Task: {task_title} By: {assigner}",
    key: "{assigner} assigned you {task_title}. You've got this!",
  },
  {
    event: "task_needs_review",
    source: "Task is ready for review! Task: {task_title} Submitted by: {assignee}",
    key: "{assignee} has {task_title} ready for your review. Take a look when you can.",
  },
  {
    event: "task_completed",
    source: "Task completed! Task {task_title} has been successfully completed.",
    key: "{task_title} is done. Nice work!",
  },
  {
    event: "task_deadline_approaching",
    source: "Deadline warning! Less than 24 hours remain for task {task_title}.",
    key: "{task_title} is due in less than 24 hours. A little heads-up to help you plan.",
  },
  {
    event: "user_mentioned",
    source: "You were mentioned! {author} mentioned you in the comments of task {task_title}.",
    key: "{author} mentioned you on {task_title}. Come join the conversation!",
  },
  {
    event: "task_commented",
    source: "New comment! {author} added a new comment on task {task_title}.",
    key: "{author} left a comment on {task_title}. Take a look!",
  },
  {
    event: "standup_submitted",
    source: "Daily Stand-up Report Your colleague {user_name} has submitted their daily standup report.",
    key: "{user_name} shared their daily update. Here's what they've been up to.",
  },
  {
    event: "leave_requested",
    source: "New leave request! {user_name} Type: {leave_type} Please review.",
    key: "{user_name} sent a {leave_type} request. Take a look when you can.",
  },
  {
    event: "leave_resolved",
    source: "Leave request result Your leave request has been reviewed. Status: {status}",
    key: "Your leave request has been reviewed. Here's the result: {status}.",
  },
  {
    event: "timer_started",
    source: "Work timer started! {user_name} Task: {task_title}",
    key: "{user_name} started the timer for {task_title}. Time to focus!",
  },
  {
    event: "organization_created",
    source: "New organization created! Name: {org_name} Owner: {owner_name}",
    key: "{owner_name} created {org_name}. Here's to a great start!",
  },
  {
    event: "project_actually_created",
    source: "New project created! Name: {project_name} Organization: {org_name} Creator: {creator_name}",
    key: "{creator_name} created {project_name} in {org_name}. Let's get started!",
  },
  {
    event: "project_budget_set",
    source: "Project budget set! Project: {project_name} Budget: {budget} Organization: {org_name}",
    key: "The budget for {project_name} in {org_name} is now {budget}. You're all set.",
  },
  {
    event: "member_added_to_project",
    source: "New member added to project! Project: {project_name} New member: {member_name} Organization: {org_name}",
    key: "{member_name} joined {project_name} in {org_name}. Give them a warm welcome!",
  },
  {
    event: "member_added_to_org",
    source: "New member added to organization! Organization: {org_name} New member: {member_name} Role: {role}",
    key: "{member_name} joined {org_name} as {role}. Welcome to the team!",
  },
  {
    event: "you_added_to_org",
    source: "You have been added to a new organization! You are now a member of {org_name} as a {role}.",
    key: "You're now part of {org_name} as {role}. Happy to have you on the team!",
  },
  {
    event: "board_created",
    source: "New Board Created! Board {board_name} has been added to project {project_name}.",
    key: "{board_name} is ready in {project_name}. Let's organize the work!",
  },
  {
    event: "milestone_created",
    source: "New Milestone Created! Milestone {milestone_title} has been created in project {project_name}.",
    key: "A new milestone, {milestone_title}, is ready in {project_name}. Onward!",
  },
  {
    event: "task_created",
    source: "New Task Created! Task: {task_title} Project: {project_name}",
    key: "A new task, {task_title}, is ready in {project_name}. Let's get going!",
  },
];

// Older notifications only contain the server's flattened English message.
const legacyMessages = messages.map((message) => {
  const fields: string[] = [];
  const pattern = message.source.split(/(\{\w+\})/).map((part) => {
    if (/^\{\w+\}$/.test(part)) {
      fields.push(part.slice(1, -1));
      return "(.+?)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return { ...message, fields, pattern: new RegExp(`^${pattern}$`) };
});

const renderMessage = (key: string, fields: string[], values: Record<string, string>) => {
  const translatedValues = Object.fromEntries(fields.map((field) => {
    const value = values[field];
    if (field === "status") {
      const status = value?.toLowerCase();
      if (status === "approved" || value === "تأیید شده") return [field, t("تأیید شده")];
      if (status === "rejected" || value === "رد شده") return [field, t("رد شده")];
      if (status === "pending" || value === "در انتظار") return [field, t("در انتظار")];
    }
    if (field === "leave_type") {
      const leaveTypes: Record<string, string> = {
        vacation: "Vacation", "vacation leave": "Vacation", "استحقاقی": "Vacation",
        sick: "Sick Leave", "sick leave": "Sick Leave", "استعلاجی": "Sick Leave",
        hourly: "Hourly Leave", "hourly leave": "Hourly Leave", "مرخصی ساعتی": "Hourly Leave",
        remote: "دورکاری", "remote work": "دورکاری", "remote work request": "دورکاری", "دورکاری": "دورکاری",
        overtime: "Overtime", "اضافه‌کاری": "Overtime",
      };
      if (leaveTypes[value?.toLowerCase()]) return [field, t(leaveTypes[value.toLowerCase()])];
      if (!value || value === "leave") return [field, t("Time off")];
    }
    if (field === "role") {
      const roles: Record<string, string> = { owner: "Owner", admin: "Admin", employee: "Employee", member: "Member", guest: "Guest" };
      if (roles[value?.toLowerCase()]) return [field, t(roles[value.toLowerCase()])];
    }
    if ((!value || ["your colleague", "manager", "system admin", "someone"].includes(value)) && ["creator_name", "assigner", "assignee", "author", "remover_name"].includes(field)) {
      return [field, t("Your teammate")];
    }
    return [field, value ?? "-"];
  }));
  return t(key, translatedValues);
};

export function formatNotificationMessage(notification: Pick<Notification, "text" | "message_data">): string {
  const data = notification.message_data;
  const structured = data && legacyMessages.find((message) => message.event === data.event);
  if (structured) return renderMessage(structured.key, structured.fields, data.values ?? {});

  const text = notification.text.trim().replace(/\s+/g, " ");
  for (const message of legacyMessages) {
    const match = text.match(message.pattern);
    if (match) {
      const values = Object.fromEntries(message.fields.map((field, index) => [field, match[index + 1]]));
      return renderMessage(message.key, message.fields, values);
    }
  }

  // Translate only known seed/demo messages; keep authored broadcasts intact.
  switch (notification.text) {
    case "از همکاری شما در پروژه وبسایت هله‌دان سپاسگزاریم.": return t("Thanks for being part of the Heledone website team. Glad you're here!");
    case "نسخه جدید پنل مدیریت آماده بررسی است.": return t("The new admin panel is ready. Come take a look!");
    case "Database maintenance scheduled for Sunday at 02:00 AM UTC.": return t("A little maintenance is planned for Sunday at 02:00 AM UTC. Thanks for your patience!");
    case "Version 1.2.0 deployed successfully. Added discount code progress bars.": return t("Version 1.2.0 is live! Discount codes now have progress bars.");
    case "Security audit passed with zero high-risk vulnerabilities.": return t("Good news! The security audit found no high-risk vulnerabilities.");
    default: return notification.text;
  }
}
