import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { getAdminUsers, getAdminUser, createAdminUser, updateAdminUser, updateUserRole, deleteAdminUser, getAdminClasses, createAdminClass, updateAdminClass, deleteAdminClass, getAdminStats, getAdminSupportTickets, replyAdminSupportTicket, getAdminMaintenance, enableAdminMaintenance, disableAdminMaintenance, type MaintenanceState, type AdminUser, type AdminClass, type AdminStats, type AdminSupportTicket, type CreateUserData, type UpdateUserData, type CreateClassData } from "../lib/api/admin";
import { Users, BookOpen, BarChart3, Plus, Edit, Trash2, Shield, User as UserIcon, GraduationCap, Search, Wrench } from "lucide-react";
type Tab = "stats" | "users" | "classes" | "support" | "maintenance";
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}
export const AdminDashboardPage: React.FC = () => {
  const {
    t
  } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersFilter, setUsersFilter] = useState<{
    role?: string;
    userMode?: string;
  }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showEditClass, setShowEditClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState<AdminClass | null>(null);
  const [showDeleteClassConfirm, setShowDeleteClassConfirm] = useState(false);
  const [classToDelete, setClassToDelete] = useState<number | null>(null);
  const [supportTickets, setSupportTickets] = useState<AdminSupportTicket[]>([]);
  const [showSupportTicket, setShowSupportTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<AdminSupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState | null>(null);
  const [maintenanceTitle, setMaintenanceTitle] = useState("Технічне обслуговування");
  const [maintenanceMessage, setMaintenanceMessage] = useState("Ми тимчасово виконуємо оновлення. Спробуйте трохи пізніше.");
  const [maintenanceUntil, setMaintenanceUntil] = useState<string>("");
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [newUser, setNewUser] = useState<CreateUserData>({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "USER",
    userMode: "PERSONAL",
    lang: "JAVA"
  });
  const [editUser, setEditUser] = useState<UpdateUserData>({});
  const [newClass, setNewClass] = useState<CreateClassData>({
    name: "",
    language: "JAVA",
    teacherId: 0
  });
  const [editClass, setEditClass] = useState<Partial<CreateClassData>>({});
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  useEffect(() => {
    loadData();
  }, [activeTab, usersPage, usersFilter]);
  useEffect(() => {
    if (activeTab === "classes") {
      loadTeachers();
    }
  }, [activeTab]);
  const loadTeachers = async () => {
    try {
      const teachersData = await getAdminUsers({
        role: "TEACHER",
        limit: 100
      });
      setTeachers(teachersData.users);
    } catch (error) {
      console.error("Failed to load teachers:", error);
    }
  };
  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "stats") {
        const statsData = await getAdminStats();
        setStats(statsData);
      } else if (activeTab === "users") {
        const usersData = await getAdminUsers({
          page: usersPage,
          limit: 20,
          ...usersFilter
        });
        setUsers(usersData.users);
        setUsersTotal(usersData.pagination.total);
      } else if (activeTab === "classes") {
        const classesData = await getAdminClasses();
        setClasses(classesData.classes);
      } else if (activeTab === "support") {
        const data = await getAdminSupportTickets();
        setSupportTickets(data.tickets);
      } else if (activeTab === "maintenance") {
        const data = await getAdminMaintenance();
        setMaintenanceState(data.state);
        setMaintenanceTitle(data.state.title || "Технічне обслуговування");
        setMaintenanceMessage(data.state.message || "");
        setMaintenanceUntil(toDatetimeLocalValue(data.state.until));
      }
    } catch (error: any) {
      console.error("Failed to load data:", error);
      if (error.response?.status === 403) {
        alert("Access denied. Only SYSTEM_ADMIN can access this page.");
        window.location.href = "/";
      }
    } finally {
      setLoading(false);
    }
  };
  const handleEnableOrUpdateMaintenance = async () => {
    const title = maintenanceTitle.trim();
    const message = maintenanceMessage.trim();
    if (!title) {
      alert("Title is required");
      return;
    }
    if (!message) {
      alert("Message is required");
      return;
    }
    setMaintenanceSaving(true);
    try {
      const untilIso = maintenanceUntil ? new Date(maintenanceUntil).toISOString() : null;
      const res = await enableAdminMaintenance({
        title,
        message,
        until: untilIso
      });
      setMaintenanceState(res.state);
      window.dispatchEvent(new CustomEvent("studycod:adminMaintenance", {
        detail: {
          enabled: !!res.state.enabled
        }
      }));
      alert("Maintenance enabled/updated");
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to enable maintenance");
    } finally {
      setMaintenanceSaving(false);
    }
  };
  const handleDisableMaintenance = async () => {
    setMaintenanceSaving(true);
    try {
      const res = await disableAdminMaintenance();
      setMaintenanceState(res.state);
      window.dispatchEvent(new CustomEvent("studycod:adminMaintenance", {
        detail: {
          enabled: !!res.state.enabled
        }
      }));
      alert("Maintenance disabled");
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to disable maintenance");
    } finally {
      setMaintenanceSaving(false);
    }
  };
  const openSupportTicket = (t: AdminSupportTicket) => {
    setSelectedTicket(t);
    setReplyText("");
    setShowSupportTicket(true);
  };
  const handleReplyToTicket = async () => {
    if (!selectedTicket) return;
    const trimmed = replyText.trim();
    if (!trimmed) {
      alert("Reply text is required");
      return;
    }
    setReplying(true);
    try {
      await replyAdminSupportTicket(selectedTicket.id, {
        replyText: trimmed
      });
      setShowSupportTicket(false);
      setSelectedTicket(null);
      setReplyText("");
      await loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to send reply");
    } finally {
      setReplying(false);
    }
  };
  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      alert("Username and password are required");
      return;
    }
    try {
      await createAdminUser(newUser);
      setShowCreateUser(false);
      setNewUser({
        username: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        role: "USER",
        userMode: "PERSONAL",
        lang: "JAVA"
      });
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to create user");
    }
  };
  const handleEditUser = async () => {
    if (!selectedUser) return;
    try {
      await updateAdminUser(selectedUser.id, editUser);
      setShowEditUser(false);
      setSelectedUser(null);
      setEditUser({});
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to update user");
    }
  };
  const handleUpdateRole = async (userId: number, role: "USER" | "TEACHER" | "SYSTEM_ADMIN") => {
    try {
      await updateUserRole(userId, {
        role
      });
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to update role");
    }
  };
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteAdminUser(userToDelete);
      setShowDeleteUserConfirm(false);
      setUserToDelete(null);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to delete user");
    }
  };
  const handleCreateClass = async () => {
    if (!newClass.name || !newClass.teacherId) {
      alert("Name and teacher are required");
      return;
    }
    try {
      await createAdminClass(newClass);
      setShowCreateClass(false);
      setNewClass({
        name: "",
        language: "JAVA",
        teacherId: 0
      });
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to create class");
    }
  };
  const handleEditClass = async () => {
    if (!selectedClass) return;
    try {
      await updateAdminClass(selectedClass.id, editClass);
      setShowEditClass(false);
      setSelectedClass(null);
      setEditClass({});
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to update class");
    }
  };
  const handleDeleteClass = async () => {
    if (!classToDelete) return;
    try {
      await deleteAdminClass(classToDelete);
      setShowDeleteClassConfirm(false);
      setClassToDelete(null);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to delete class");
    }
  };
  const openEditUser = async (user: AdminUser) => {
    setSelectedUser(user);
    setEditUser({
      email: user.email || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      lang: user.lang
    });
    setShowEditUser(true);
  };
  const openEditClass = (classItem: AdminClass) => {
    setSelectedClass(classItem);
    setEditClass({
      name: classItem.name,
      language: classItem.language,
      teacherId: classItem.teacherId
    });
    setShowEditClass(true);
  };
  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) || u.lastName?.toLowerCase().includes(searchQuery.toLowerCase()));
  if (loading && activeTab === "stats") {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t("loading")}
      </div>;
  }
  return <div className="h-full flex flex-col bg-bg-base">
      {}
      <div className="border-b border-border p-4 bg-bg-secondary">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-mono font-bold text-text-primary flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Admin Panel
          </h1>
        </div>
      </div>

      {}
      <div className="flex gap-2 p-4 border-b border-border bg-bg-secondary">
        <Button variant={activeTab === "stats" ? "primary" : "secondary"} onClick={() => setActiveTab("stats")} className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Statistics
        </Button>
        <Button variant={activeTab === "users" ? "primary" : "secondary"} onClick={() => setActiveTab("users")} className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          Users
        </Button>
        <Button variant={activeTab === "classes" ? "primary" : "secondary"} onClick={() => setActiveTab("classes")} className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Classes
        </Button>

        <Button variant={activeTab === "support" ? "primary" : "secondary"} onClick={() => setActiveTab("support")} className="flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Support
        </Button>

        <Button variant={activeTab === "maintenance" ? "primary" : "secondary"} onClick={() => setActiveTab("maintenance")} className="flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          Maintenance
        </Button>
      </div>

      {}
      <div className="flex-1 overflow-auto p-4">
        {}
        {activeTab === "stats" && stats && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">Total Users</h3>
                <Users className="w-5 h-5 text-text-secondary" />
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats.users.total}</p>
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Teachers:</span>
                  <span className="text-text-primary">{stats.users.teachers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Admins:</span>
                  <span className="text-text-primary">{stats.users.admins}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">User Modes</h3>
                <UserIcon className="w-5 h-5 text-text-secondary" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Personal:</span>
                  <span className="text-text-primary font-semibold">{stats.users.byMode.PERSONAL}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Educational:</span>
                  <span className="text-text-primary font-semibold">{stats.users.byMode.EDUCATIONAL}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">Total Classes</h3>
                <BookOpen className="w-5 h-5 text-text-secondary" />
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats.classes.total}</p>
            </Card>
          </div>}

        {}
        {activeTab === "users" && <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <Input type="text" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="flex gap-2">
                <select value={usersFilter.role || ""} onChange={e => setUsersFilter({
              ...usersFilter,
              role: e.target.value || undefined
            })} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                  <option value="">All Roles</option>
                  <option value="USER">User</option>
                  <option value="TEACHER">Teacher</option>
                  <option value="SYSTEM_ADMIN">Admin</option>
                </select>
                <select value={usersFilter.userMode || ""} onChange={e => setUsersFilter({
              ...usersFilter,
              userMode: e.target.value || undefined
            })} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                  <option value="">All Modes</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="EDUCATIONAL">Educational</option>
                </select>
                <Button onClick={() => setShowCreateUser(true)} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create User
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-bg-secondary border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">ID</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Username</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Email</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Role</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Mode</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Language</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => <tr key={user.id} className="border-b border-border hover:bg-bg-secondary transition-fast">
                        <td className="px-4 py-2 text-sm text-text-primary font-mono">{user.id}</td>
                        <td className="px-4 py-2 text-sm text-text-primary">{user.username}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.email || "-"}</td>
                        <td className="px-4 py-2">
                          <select value={user.role} onChange={e => handleUpdateRole(user.id, e.target.value as "USER" | "TEACHER" | "SYSTEM_ADMIN")} className="px-2 py-1 border border-border bg-bg-secondary text-text-primary font-mono text-xs">
                            <option value="USER">USER</option>
                            <option value="TEACHER">TEACHER</option>
                            <option value="SYSTEM_ADMIN">ADMIN</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.userMode}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.lang}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => openEditUser(user)} className="flex items-center gap-1">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => {
                        setUserToDelete(user.id);
                        setShowDeleteUserConfirm(true);
                      }} className="flex items-center gap-1 text-red-500 hover:text-red-700">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>)}
                  </tbody>
                </table>
              </div>
              {usersTotal > 20 && <div className="p-4 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    Showing {(usersPage - 1) * 20 + 1} - {Math.min(usersPage * 20, usersTotal)} of {usersTotal}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setUsersPage(p => Math.max(1, p - 1))} disabled={usersPage === 1}>
                      Previous
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setUsersPage(p => p + 1)} disabled={usersPage * 20 >= usersTotal}>
                      Next
                    </Button>
                  </div>
                </div>}
            </Card>
          </div>}

        {}
        {activeTab === "classes" && <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowCreateClass(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create Class
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map(classItem => <Card key={classItem.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-mono font-semibold text-text-primary text-lg">{classItem.name}</h3>
                      <p className="text-sm text-text-secondary mt-1">{classItem.language}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditClass(classItem)} className="flex items-center gap-1">
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => {
                  setClassToDelete(classItem.id);
                  setShowDeleteClassConfirm(true);
                }} className="flex items-center gap-1 text-red-500 hover:text-red-700">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-text-secondary">
                      Teacher: <span className="text-text-primary">{classItem.teacherName}</span>
                    </p>
                    <p className="text-sm text-text-secondary mt-1">
                      Created: <span className="text-text-primary">{new Date(classItem.createdAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                </Card>)}
            </div>
          </div>}

        {}
        {activeTab === "support" && <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-bg-secondary border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">ID</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Email</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Subject</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Status</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Created</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Answered</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supportTickets.map(t => <tr key={t.id} className="border-b border-border hover:bg-bg-secondary transition-fast">
                        <td className="px-4 py-2 text-sm text-text-primary font-mono">{t.id}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary font-mono">{t.userEmail}</td>
                        <td className="px-4 py-2 text-sm text-text-primary">{t.subject}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary font-mono">{t.status}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary font-mono">
                          {new Date(t.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-sm text-text-secondary font-mono">
                          {t.answeredAt ? new Date(t.answeredAt).toLocaleString() : "-"}
                        </td>
                        <td className="px-4 py-2">
                          <Button variant="secondary" size="sm" onClick={() => openSupportTicket(t)}>
                            View / Reply
                          </Button>
                        </td>
                      </tr>)}
                    {supportTickets.length === 0 && <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-text-secondary font-mono text-sm">
                          No tickets yet.
                        </td>
                      </tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>}

        {}
        {activeTab === "maintenance" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-mono font-semibold text-text-primary">Global maintenance mode</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Коли увімкнено — сайт блокується для всіх, крім SYSTEM_ADMIN. Доступними залишаються /api/auth/* та /api/admin/*.
                  </p>
                </div>
                <div className={`px-3 py-1 text-xs font-mono border rounded-md ${maintenanceState?.enabled ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-border bg-bg-code text-text-secondary"}`}>
                  {maintenanceState?.enabled ? "ENABLED" : "DISABLED"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Title</div>
                  <Input value={maintenanceTitle} onChange={e => setMaintenanceTitle(e.target.value)} />
                </div>

                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Message</div>
                  <textarea value={maintenanceMessage} onChange={e => setMaintenanceMessage(e.target.value)} rows={5} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" />
                </div>

                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Until (optional)</div>
                  <Input type="datetime-local" value={maintenanceUntil} onChange={e => setMaintenanceUntil(e.target.value)} />
                  <div className="mt-1 text-xs text-text-secondary">
                    Якщо порожньо — без таймера. Значення перетворюється в ISO (UTC) перед збереженням.
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleEnableOrUpdateMaintenance} disabled={maintenanceSaving} className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  {maintenanceState?.enabled ? "Update" : "Enable"}
                </Button>
                <Button variant="secondary" onClick={handleDisableMaintenance} disabled={maintenanceSaving} className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Disable
                </Button>
              </div>
            </Card>
          </div>}
      </div>

      {}
      <Modal isOpen={showCreateUser} onClose={() => setShowCreateUser(false)} title="Create User">
        <div className="space-y-4">
          <Input label="Username" value={newUser.username} onChange={e => setNewUser({
          ...newUser,
          username: e.target.value
        })} required />
          <Input label="Email" type="email" value={newUser.email} onChange={e => setNewUser({
          ...newUser,
          email: e.target.value
        })} />
          <Input label="Password" type="password" value={newUser.password} onChange={e => setNewUser({
          ...newUser,
          password: e.target.value
        })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={newUser.firstName} onChange={e => setNewUser({
            ...newUser,
            firstName: e.target.value
          })} />
            <Input label="Last Name" value={newUser.lastName} onChange={e => setNewUser({
            ...newUser,
            lastName: e.target.value
          })} />
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Role</label>
            <select value={newUser.role} onChange={e => setNewUser({
            ...newUser,
            role: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="USER">USER</option>
              <option value="TEACHER">TEACHER</option>
              <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">User Mode</label>
            <select value={newUser.userMode} onChange={e => setNewUser({
            ...newUser,
            userMode: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="PERSONAL">PERSONAL</option>
              <option value="EDUCATIONAL">EDUCATIONAL</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
            <select value={newUser.lang} onChange={e => setNewUser({
            ...newUser,
            lang: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="JAVA">JAVA</option>
              <option value="PYTHON">PYTHON</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateUser(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>Create</Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showEditUser} onClose={() => setShowEditUser(false)} title="Edit User">
        {selectedUser && <div className="space-y-4">
            <Input label="Email" type="email" value={editUser.email || ""} onChange={e => setEditUser({
          ...editUser,
          email: e.target.value
        })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={editUser.firstName || ""} onChange={e => setEditUser({
            ...editUser,
            firstName: e.target.value
          })} />
              <Input label="Last Name" value={editUser.lastName || ""} onChange={e => setEditUser({
            ...editUser,
            lastName: e.target.value
          })} />
            </div>
            <Input label="New Password (leave empty to keep current)" type="password" value={editUser.password || ""} onChange={e => setEditUser({
          ...editUser,
          password: e.target.value
        })} />
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={editUser.lang || selectedUser.lang} onChange={e => setEditUser({
            ...editUser,
            lang: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowEditUser(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditUser}>Save</Button>
            </div>
          </div>}
      </Modal>

      {}
      <Modal isOpen={showDeleteUserConfirm} onClose={() => setShowDeleteUserConfirm(false)} title="Delete User">
        <div className="space-y-4">
          <p className="text-text-primary">Are you sure you want to delete this user? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteUserConfirm(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleDeleteUser} className="text-red-500 hover:text-red-700">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showCreateClass} onClose={() => setShowCreateClass(false)} title="Create Class">
        <div className="space-y-4">
          <Input label="Class Name" value={newClass.name} onChange={e => setNewClass({
          ...newClass,
          name: e.target.value
        })} required />
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
            <select value={newClass.language} onChange={e => setNewClass({
            ...newClass,
            language: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="JAVA">JAVA</option>
              <option value="PYTHON">PYTHON</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Teacher</label>
            <select value={newClass.teacherId || 0} onChange={e => setNewClass({
            ...newClass,
            teacherId: parseInt(e.target.value) || 0
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value={0}>Select teacher...</option>
              {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>
                  {teacher.username} ({teacher.email || "No email"})
                </option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateClass(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateClass}>Create</Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showEditClass} onClose={() => setShowEditClass(false)} title="Edit Class">
        {selectedClass && <div className="space-y-4">
            <Input label="Class Name" value={editClass.name || ""} onChange={e => setEditClass({
          ...editClass,
          name: e.target.value
        })} />
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={editClass.language || selectedClass.language} onChange={e => setEditClass({
            ...editClass,
            language: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Teacher</label>
              <select value={editClass.teacherId || selectedClass.teacherId} onChange={e => setEditClass({
            ...editClass,
            teacherId: parseInt(e.target.value) || 0
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value={0}>Select teacher...</option>
                {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>
                    {teacher.username} ({teacher.email || "No email"})
                  </option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowEditClass(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditClass}>Save</Button>
            </div>
          </div>}
      </Modal>

      {}
      <Modal isOpen={showDeleteClassConfirm} onClose={() => setShowDeleteClassConfirm(false)} title="Delete Class">
        <div className="space-y-4">
          <p className="text-text-primary">Are you sure you want to delete this class? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteClassConfirm(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleDeleteClass} className="text-red-500 hover:text-red-700">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showSupportTicket} onClose={() => {
      setShowSupportTicket(false);
      setSelectedTicket(null);
      setReplyText("");
    }} title={selectedTicket ? `Ticket #${selectedTicket.id}` : "Ticket"}>
        {selectedTicket && <div className="space-y-4">
            <div className="text-sm font-mono text-text-secondary">From: {selectedTicket.userEmail}</div>
            <div className="text-sm font-mono text-text-secondary">Subject: {selectedTicket.subject}</div>
            <div className="text-sm font-mono text-text-secondary">Status: {selectedTicket.status}</div>

            <div className="border border-border bg-bg-secondary p-3">
              <div className="text-xs font-mono text-text-muted uppercase tracking-wider mb-2">Message</div>
              <div className="text-sm text-text-primary whitespace-pre-wrap">{selectedTicket.message}</div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Reply</label>
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)} className="w-full min-h-[140px] resize-y bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-text-muted" placeholder="Type your reply..." />
              <div className="text-xs text-text-secondary font-mono">
                Email will be sent from techical-support@studycod.space
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => {
            setShowSupportTicket(false);
            setSelectedTicket(null);
            setReplyText("");
          }} disabled={replying}>
                Cancel
              </Button>
              <Button onClick={handleReplyToTicket} disabled={replying}>
                {replying ? "Sending..." : "Send Reply"}
              </Button>
            </div>
          </div>}
      </Modal>
    </div>;
};