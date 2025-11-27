"use client";

import React, { useState } from 'react';

// Type definitions
type PageKey = 'Dashboard' | 'Analytics' | 'Users' | 'Projects' | 'Tasks';

interface PageContentItem {
    title: string;
    description: string;
    content: React.ReactNode;
}

interface NavItem {
    page: PageKey;
    icon: React.ReactNode;
}

interface SidebarProps {
    activePage: PageKey;
    setActivePage: (page: PageKey) => void;
}

interface MainContentProps {
    activePage: PageKey;
}

// --- Data for each page ---
const pageContent: Record<PageKey, PageContentItem> = {
    Dashboard: {
        title: 'Dashboard',
        description: "Welcome back, Serafim. Here's what's happening today.",
        content: (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white">Active Projects</h2>
                    <p className="text-4xl font-bold mt-2 text-indigo-400">12</p>
                </div>
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white">Tasks Due</h2>
                    <p className="text-4xl font-bold mt-2 text-pink-400">5</p>
                </div>
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white">New Users</h2>
                    <p className="text-4xl font-bold mt-2 text-emerald-400">28</p>
                </div>
            </div>
        )
    },
    Analytics: {
        title: 'Analytics',
        description: 'Detailed insights and metrics for your projects.',
        content: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 lg:col-span-2 h-64 flex items-center justify-center">
                    <p className="text-gray-400">Chart placeholder for User Growth</p>
                </div>
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white">Bounce Rate</h2>
                    <p className="text-4xl font-bold mt-2 text-indigo-400">24.5%</p>
                </div>
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white">Session Duration</h2>
                    <p className="text-4xl font-bold mt-2 text-pink-400">8m 12s</p>
                </div>
            </div>
        )
    },
    Users: {
        title: 'Users',
        description: 'Manage all the users in your organization.',
        content: (
            <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-gray-300 font-medium">Name</th>
                            <th className="text-left py-3 px-4 text-gray-300 font-medium">Email</th>
                            <th className="text-left py-3 px-4 text-gray-300 font-medium">Role</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-3 px-4 text-white">Jane Doe</td>
                            <td className="py-3 px-4 text-gray-400">jane.doe@example.com</td>
                            <td className="py-3 px-4 text-gray-400">Admin</td>
                        </tr>
                        <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-3 px-4 text-white">John Smith</td>
                            <td className="py-3 px-4 text-gray-400">john.smith@example.com</td>
                            <td className="py-3 px-4 text-gray-400">Developer</td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="py-3 px-4 text-white">Sam Wilson</td>
                            <td className="py-3 px-4 text-gray-400">sam.wilson@example.com</td>
                            <td className="py-3 px-4 text-gray-400">Designer</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        )
    },
    Projects: {
        title: 'Projects',
        description: 'An overview of all your ongoing and completed projects.',
        content: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white">Project Alpha</h2>
                    <p className="text-sm text-gray-400 mt-1">Status: In Progress</p>
                </div>
                <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white">Project Beta</h2>
                    <p className="text-sm text-gray-400 mt-1">Status: Completed</p>
                </div>
            </div>
        )
    },
    Tasks: {
        title: 'Tasks',
        description: 'Track and manage all your tasks and to-dos.',
        content: (
            <div className="content-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <ul className="space-y-3">
                    <li className="flex items-center justify-between py-3 px-4 bg-white/5 rounded-lg">
                        <span className="text-white">Finalize Q3 report</span>
                        <span className="text-xs text-pink-400">Due Tomorrow</span>
                    </li>
                    <li className="flex items-center justify-between py-3 px-4 bg-white/5 rounded-lg">
                        <span className="text-white">Design new landing page mockups</span>
                        <span className="text-xs text-gray-400">In Progress</span>
                    </li>
                    <li className="flex items-center justify-between py-3 px-4 bg-white/5 rounded-lg">
                        <span className="text-white">Deploy server updates</span>
                        <span className="text-xs text-emerald-400">Completed</span>
                    </li>
                </ul>
            </div>
        )
    }
};

const navItems: NavItem[] = [
    { page: 'Dashboard', icon: <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> },
    { page: 'Analytics', icon: <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg> },
    { page: 'Users', icon: <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> },
    { page: 'Projects', icon: <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },
    { page: 'Tasks', icon: <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> },
];

// Sidebar Component
const Sidebar = ({ activePage, setActivePage }: SidebarProps) => (
    <aside className="bg-white/5 backdrop-blur-xl border-r border-white/10 w-64 flex-shrink-0 flex flex-col z-10">
        <div className="h-20 flex items-center justify-center border-b border-white/10">
            <div className="flex items-center gap-2">
                <svg className="w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                <span className="text-xl font-bold text-white">AetherUI</span>
            </div>
        </div>
        <nav className="flex-grow p-4 space-y-2">
            {navItems.map(item => (
                <a
                    key={item.page}
                    href="#"
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg text-gray-300 transition-all duration-200 hover:bg-white/10 ${
                        activePage === item.page 
                            ? 'bg-white/10 text-white border-l-2 border-indigo-400' 
                            : ''
                    }`}
                    onClick={(e) => {
                        e.preventDefault();
                        setActivePage(item.page);
                    }}
                >
                    {item.icon}
                    <span>{item.page}</span>
                </a>
            ))}
        </nav>
        <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3">
                <img src="https://i.pravatar.cc/150?u=serafim" alt="User Avatar" className="w-10 h-10 rounded-full border-2 border-indigo-400" />
                <div>
                    <p className="font-semibold text-white">Serafim P.</p>
                    <p className="text-xs text-gray-400">Admin</p>
                </div>
            </div>
        </div>
    </aside>
);

// Main Content Component
const MainContent = ({ activePage }: MainContentProps) => {
    const { title, description, content } = pageContent[activePage];
    return (
        <main className="flex-grow p-8">
            <h1 className="text-3xl font-bold text-white">{title}</h1>
            <p className="text-gray-400 mt-2">{description}</p>
            <div className="mt-8">{content}</div>
        </main>
    );
};

// Main Dashboard Layout Component
export const DashboardLayout = () => {
    const [activePage, setActivePage] = useState<PageKey>('Dashboard');
    return (
        <div className="relative min-h-screen w-full flex bg-gray-900 text-gray-200 overflow-hidden">
            {/* Animated background shapes */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/30 rounded-full blur-[100px] animate-pulse"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-pink-500/30 rounded-full blur-[100px] animate-pulse"></div>
            <Sidebar activePage={activePage} setActivePage={setActivePage} />
            <MainContent activePage={activePage} />
        </div>
    );
};

export default DashboardLayout;
