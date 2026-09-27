export const metadata = { title: "Privacy policy – ReachInbox Scheduler" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6 text-gray-700">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">Privacy policy</h1>
      <p className="mb-3">
        ReachInbox Scheduler is a demo project built for a hiring assignment. Signing in with Google gives the app your
        name, email address and profile picture, which are used only to show your account and keep your campaigns
        separate from other users.
      </p>
      <p className="mb-3">
        Emails are sent through Ethereal, a test mail service, so no message reaches a real inbox. Data is not sold or
        shared with anyone, and it can be deleted on request.
      </p>
      <p>Contact: pranavbhatta71@gmail.com</p>
    </main>
  );
}
