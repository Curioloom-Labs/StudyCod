import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Award, KeyRound, ListOrdered, MessageSquare, ShieldCheck, Table2, UsersRound } from "lucide-react";
import "./ContestSectionNav.css";

export type ContestSection = "problems" | "standings" | "community" | "accounts" | "participants" | "certificates" | "management";

type ContestSectionNavProps = {
  contestId: number;
  active: ContestSection;
  canManage: boolean;
};

const mainSections = [
  { id: "problems", icon: ListOrdered, uk: "Задачі", en: "Problems" },
  { id: "standings", icon: Table2, uk: "Рейтинг", en: "Standings" },
  { id: "community", icon: MessageSquare, uk: "Спільнота", en: "Community" },
] as const;

const organizerSections = [
  { id: "accounts", icon: KeyRound, uk: "Акаунти", en: "Accounts" },
  { id: "participants", icon: UsersRound, uk: "Учасники", en: "Participants" },
  { id: "certificates", icon: Award, uk: "Сертифікати", en: "Certificates" },
  { id: "management", icon: ShieldCheck, uk: "Керування", en: "Manage" },
] as const;

export const ContestSectionNav: React.FC<ContestSectionNavProps> = ({ contestId, active, canManage }) => {
  const location = useLocation();
  const { i18n } = useTranslation();
  const isEn = (i18n.language ?? "").toLowerCase().startsWith("en");
  const preserved = new URLSearchParams(location.search);
  preserved.delete("tab");
  preserved.delete("settings");
  const preservedQuery = preserved.toString();
  const suffix = preservedQuery ? `?${preservedQuery}` : "";
  const contestPath = `/contest/contests/${contestId}`;
  const managePath = `${contestPath}/manage`;
  const sections = canManage ? [...mainSections, ...organizerSections] : mainSections;

  const hrefFor = (id: ContestSection) => {
    if (id === "standings") return `${contestPath}/scoreboard${suffix}`;
    const query = new URLSearchParams(preserved);
    if (id !== "problems") query.set("tab", id);
    const search = query.toString();
    return `${managePath}${search ? `?${search}` : ""}`;
  };

  return (
    <nav aria-label={isEn ? "Contest sections" : "Розділи контесту"} className="contest-section-nav">
      <div className="contest-section-nav__items">
        {sections.map(({ id, icon: Icon, uk, en }, index) => (
          <React.Fragment key={id}>
            {canManage && index === mainSections.length ? <span className="contest-section-nav__group">{isEn ? "Organizer" : "Організатор"}</span> : null}
            <Link
              to={hrefFor(id)}
              aria-current={active === id ? "page" : undefined}
              className={`contest-section-nav__link${active === id ? " is-active" : ""}`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{isEn ? en : uk}</span>
            </Link>
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
};
