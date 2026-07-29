import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { SettingsSection, SettingsToggleRow, SettingsRow } from "@/components/settings";
import { UserCircle, FileText, Award, Eye, Pencil } from "@/components/Icons";
import { useApp } from "@/store";
import { userService, profileControlService } from "@/services";

/**
 * What neighbours can see about you. The four visibility flags that used to be
 * buried mid-way down the old /settings page, now behind a row that says
 * exactly this.
 *
 * The name/phone/email/location visibility switches deliberately stay in
 * Edit profile — they sit next to the fields they govern, which is where you
 * are when you think about them. The row at the bottom links there rather than
 * cloning them, so there is exactly one home for each switch.
 */
export default function PrivacySettings() {
  const nav = useNavigate();
  const { user, refreshUser, showToast } = useApp();

  const [showPosts, setShowPosts] = useState(user.showPostsPublicly ?? true);
  const [showAsks, setShowAsks] = useState(user.showAsksPublicly ?? true);
  const [showBadges, setShowBadges] = useState(user.showBadgesPublicly ?? true);
  const [customerEnabled, setCustomerEnabled] = useState(user.customerEnabled !== false);

  useEffect(() => {
    setShowPosts(user.showPostsPublicly ?? true);
    setShowAsks(user.showAsksPublicly ?? true);
    setShowBadges(user.showBadgesPublicly ?? true);
    setCustomerEnabled(user.customerEnabled !== false);
  }, [user.showPostsPublicly, user.showAsksPublicly, user.showBadgesPublicly, user.customerEnabled]);

  function persist(
    patch: Record<string, boolean>,
    apply: (v: boolean) => void,
    next: boolean,
    onLabel: string,
    offLabel: string,
  ) {
    apply(next);
    userService.update(patch as any)
      .then(() => showToast(next ? onLabel : offLabel))
      .catch(() => { apply(!next); showToast("Couldn't save — try again"); });
  }

  async function handleToggleCustomerEnabled(v: boolean) {
    setCustomerEnabled(v);
    try {
      await profileControlService.setEnabled("CUSTOMER", null, v);
      showToast(v ? "Customer profile is now visible" : "Customer profile hidden from discovery");
      void refreshUser();
    } catch (err: any) {
      setCustomerEnabled(!v);
      showToast(err.message || "Failed to update visibility");
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Privacy & visibility" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

        <SettingsSection title="On your public profile">
          <SettingsToggleRow
            icon={<FileText size={19} color="var(--brand-600)" />}
            label="Community posts"
            hint="Let neighbours see what you've posted"
            on={showPosts}
            onChange={(v) => persist({ showPostsPublicly: v }, setShowPosts, v, "Posts are visible", "Posts hidden")}
          />
          <SettingsToggleRow
            icon={<FileText size={19} color="var(--brand-700)" />}
            label="Service requests"
            hint="Let neighbours see your open & past asks"
            on={showAsks}
            onChange={(v) => persist({ showAsksPublicly: v }, setShowAsks, v, "Requests are visible", "Requests hidden")}
          />
          <SettingsToggleRow
            icon={<Award size={19} color="var(--green-600)" />}
            label="Badges"
            hint="Show your trust badges & verifications"
            on={showBadges}
            onChange={(v) => persist({ showBadgesPublicly: v }, setShowBadges, v, "Badges are visible", "Badges hidden")}
          />
        </SettingsSection>

        <SettingsSection title="Discoverability">
          <SettingsToggleRow
            icon={<Eye size={19} color="var(--ink-600)" />}
            label="Show my profile publicly"
            hint="When off, you're hidden from search and leaderboards"
            on={customerEnabled}
            onChange={handleToggleCustomerEnabled}
          />
        </SettingsSection>

        <SettingsSection title="Your details">
          {/* Name / phone / email / area visibility live beside the fields
              themselves in Edit profile — linking rather than duplicating, so
              each switch has exactly one home. */}
          <SettingsRow
            icon={<Pencil size={19} color="var(--brand-600)" />}
            label="Name, phone & location privacy"
            hint="Managed with the fields themselves, in Edit profile"
            onClick={() => nav("/profile/edit")}
          />
          <SettingsRow
            icon={<UserCircle size={19} color="var(--brand-600)" />}
            label="Preview your public profile"
            hint="See exactly what a neighbour sees"
            onClick={() => nav(`/u/${user.id}`)}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
