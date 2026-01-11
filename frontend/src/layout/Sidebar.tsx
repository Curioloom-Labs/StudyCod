import React from 'react';
import { NavLink } from 'react-router-dom';
import { Code2, LayoutDashboard, CheckCircle2, GraduationCap, BookOpen, User, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { User as AuthUser } from '../types';
interface SidebarProps {
  user: AuthUser;
  onLogout: () => void;
}
export const Sidebar: React.FC<SidebarProps> = ({
  user,
  onLogout
}) => {
  const {
    t
  } = useTranslation();
  const menu = [{
    to: '/dashboard',
    label: t('home'),
    icon: LayoutDashboard
  }, {
    to: '/tasks',
    label: t('tasks'),
    icon: CheckCircle2
  }, {
    to: '/grades',
    label: t('grades'),
    icon: GraduationCap
  }, {
    to: '/theory',
    label: t('theory'),
    icon: BookOpen
  }, {
    to: '/profile',
    label: t('profile'),
    icon: User
  }];
  return <aside className="hidden md:flex w-64 bg-bg-surface text-text-primary h-screen fixed left-0 top-0 flex-col border-r border-border z-20">
      <div className="p-6 flex items-center space-x-3 border-b border-border">
        <div className="bg-primary p-2 rounded-lg text-bg-base">
          <Code2 size={24} />
        </div>
        <span className="text-xl font-mono font-bold tracking-tight">StudyCod</span>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menu.map(item => {
        const Icon = item.icon;
        return <NavLink key={item.to} to={item.to} className={({
          isActive
        }) => `w-full flex items-center space-x-3 px-4 py-3 border transition-fast font-mono ${isActive ? 'border-primary bg-bg-hover text-primary shadow-[0_0_15px_rgba(0,255,136,0.1)]' : 'border-transparent text-text-secondary hover:border-border hover:bg-bg-hover hover:text-text-primary'}`}>
              <Icon size={20} />
              <span className="font-medium text-sm">{item.label}</span>
            </NavLink>;
      })}
      </nav>
      <div className="p-4 border-t border-border font-mono">
        <div className="flex items-center space-x-3 px-4 py-3 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-xs text-bg-base">
            {user.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate text-text-primary">{user.username}</p>
            <p className="text-xs text-text-muted truncate">{user.course === 'JAVA' ? 'Java' : 'Python'} course</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center space-x-3 px-4 py-2 text-accent-error hover:bg-accent-error/10 hover:text-accent-error rounded-none border border-transparent hover:border-accent-error/20 transition-fast">
          <LogOut size={18} />
          <span className="text-xs">{t('logout')}</span>
        </button>
      </div>
    </aside>;
};