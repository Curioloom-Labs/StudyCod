import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Award, Gauge, Trophy, UserRound } from "lucide-react";

type ProfileSection = "iad" | "certificates";

type Props = {
  active: ProfileSection;
  className?: string;
  action?: React.ReactNode;
};

export const ProfileSectionNav: React.FC<Props> = ({ active, className = "", action }) => {
  const { i18n } = useTranslation();
  const english = i18n.language.toLowerCase().startsWith("en");
  const copy = (uk: string, en: string) => english ? en : uk;
  const links = [
    { id: "profile", label: copy("Профіль", "Profile"), href: "/?app=profile", Icon: UserRound },
    { id: "iad", label: "IAD", href: "/iad", Icon: Gauge },
    { id: "certificates", label: copy("Сертифікати", "Certificates"), href: "/profile/certificates", Icon: Award },
    { id: "contests", label: copy("Контести", "Contests"), href: "/contests", Icon: Trophy },
  ];

  return (
    <nav
      className={`rounded-[24px] border border-[#152219]/10 bg-white/88 p-2 shadow-[0_18px_45px_-36px_rgba(11,31,17,.55)] backdrop-blur dark:border-white/10 dark:bg-[#18231b]/92 ${className}`}
      aria-label={copy("Навігація профілю", "Profile navigation")}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap">
          {links.map(({ id, label, href, Icon }) => {
            const selected = active === id;
            return (
              <Link
                key={id}
                to={href}
                aria-current={selected ? "page" : undefined}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  selected
                    ? "bg-[#173321] text-white shadow-[0_14px_26px_-18px_rgba(23,51,33,.9)] dark:bg-[#edf4ef] dark:text-[#0b120d]"
                    : "bg-[#f1f6f2] text-[#314139] hover:bg-[#e5eee7] dark:bg-white/[.055] dark:text-[#dce7df] dark:hover:bg-white/[.09]"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </div>
        {action ? <div className="flex shrink-0 justify-end">{action}</div> : null}
      </div>
    </nav>
  );
};

export default ProfileSectionNav;
