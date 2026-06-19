'use client';

import Sidebar from '@/components/Sidebar';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Bell, Search, LogOut, Menu, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AgentProvider } from '@/lib/agent/AgentContext';
import AgentWidget from '@/components/AgentWidget';

const segmentMap: Record<string, string> = {
    dashboard: 'Dashboard',
    ventas: 'Ventas',
    compras: 'Compras',
    inventarios: 'Inventarios',
    reportes: 'Reportes',
    settings: 'Configuración',
    'mapadecalor': 'Mapa de Calor',
    'categorias-global': 'Categorías Global',
    'categoria-hora': 'Categorías por Hora',
    'meseros': 'Ventas por Mesero',
    'alertas': 'Alertas',
    'asistencias': 'Asistencias',
    'consumos': 'Consumos',
    'categoria-hora-real': 'Categorías por Hora Real',
    'comparativa-horas': 'Comparación de Horas',
    'operaciones': 'Operaciones',
    'tendencias': 'Tendencias de Venta',
    'retiros': 'Retiros',
    'ordenes': 'Órdenes de Compra',
    'traspasos': 'Traspasos',
    'costo': 'Costo de Inventario',
    'query-designer': 'Diseñador de Consultas',
    'margen': 'Margen & Rentabilidad',
    'productos-global': 'Productos Global',
    'agente': 'Asistente IA',
};

const searchItems = [
    { name: 'Dashboard Principal', href: '/dashboard', category: 'General' },
    { name: 'Tendencias de Venta', href: '/dashboard/ventas/tendencias', category: 'Ventas' },
    { name: 'Mapa de Calor de Ventas', href: '/dashboard/ventas/mapadecalor', category: 'Ventas' },
    { name: 'Categorías Global', href: '/dashboard/ventas/categorias-global', category: 'Ventas' },
    { name: 'Ventas por Categoría y Hora', href: '/dashboard/ventas/categoria-hora', category: 'Ventas' },
    { name: 'Ventas por Mesero', href: '/dashboard/ventas/meseros', category: 'Ventas' },
    { name: 'Ventas por Categoría y Hora Real', href: '/dashboard/ventas/categoria-hora-real', category: 'Ventas' },
    { name: 'Comparación de Horas (Standard vs Real)', href: '/dashboard/ventas/comparativa-horas', category: 'Ventas' },
    { name: 'Operaciones del Día', href: '/dashboard/ventas/operaciones', category: 'Ventas' },
    { name: 'Reporte Ventas', href: '/dashboard/reportes/ventas', category: 'Ventas' },
    { name: 'Reporte de Alertas', href: '/dashboard/reportes/alertas', category: 'Otros Reportes' },
    { name: 'Reporte de Asistencias', href: '/dashboard/reportes/asistencias', category: 'Otros Reportes' },
    { name: 'Reporte de Consumos', href: '/dashboard/reportes/consumos', category: 'Otros Reportes' },
    { name: 'Productos Global', href: '/dashboard/ventas/productos-global', category: 'Ventas' },
    { name: 'Margen & Rentabilidad', href: '/dashboard/reportes/margen', category: 'Reportes' },
    { name: 'Retiros de Caja', href: '/dashboard/ventas/retiros', category: 'Ventas' },
    { name: 'Asistente IA (Brioche)', href: '/dashboard/agente', category: 'Asistente' },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const pathname = usePathname();
    const router = useRouter();
    const paths = pathname?.split('/').filter(Boolean) || [];

    const filteredItems = useMemo(() => {
        if (!searchQuery) return [];
        return searchItems.filter(item =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    return (
        <AgentProvider>
        <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#FAF6EF' }}>
            {/* ====== HEADER ====== */}
            <header
                className="h-16 fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 select-none"
                style={{
                    background: '#ffffff',
                    borderBottom: '1px solid rgba(61, 28, 2, 0.08)',
                    boxShadow: '0 1px 12px rgba(61, 28, 2, 0.06)',
                }}
            >
                <div className="flex items-center gap-4">
                    {/* Mobile Hamburger */}
                    <button
                        className="lg:hidden p-2 rounded-xl transition-all duration-200 cursor-pointer"
                        style={{ color: '#3D1C02' }}
                        onClick={() => setIsMobileOpen(!isMobileOpen)}
                    >
                        {isMobileOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>

                    {/* Logo */}
                    <Link href="/dashboard" className="flex items-center justify-center shrink-0">
                        <img
                            src="/logo.png"
                            alt="La Petite Bretonne"
                            className="object-contain w-auto max-h-[40px] transition-transform duration-200 hover:scale-[1.02]"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    </Link>

                    {/* Divider */}
                    <div className="w-px h-6 hidden md:block mx-2" style={{ background: 'rgba(61, 28, 2, 0.15)' }} />

                    {/* Breadcrumbs */}
                    <div className="text-xs font-semibold flex items-center gap-2" style={{ color: 'rgba(61, 28, 2, 0.55)' }}>
                        <span>Plataforma</span>
                        {paths.map((path, idx) => {
                            if (path === 'dashboard' && paths.length > 1) return null;
                            const title = segmentMap[path] || path.charAt(0).toUpperCase() + path.slice(1);
                            return (
                                <React.Fragment key={path}>
                                    <span style={{ color: 'rgba(61, 28, 2, 0.3)' }}>/</span>
                                    <span style={{
                                        color: idx === paths.length - 1 ? '#C2662F' : 'rgba(61, 28, 2, 0.6)',
                                        fontWeight: idx === paths.length - 1 ? 700 : 600
                                    }}>
                                        {title}
                                    </span>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Live Search */}
                    <div className="relative">
                        <div
                            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl w-64 transition-all"
                            style={{
                                background: 'rgba(61, 28, 2, 0.07)',
                                border: '1px solid rgba(61, 28, 2, 0.18)',
                            }}
                        >
                            <Search size={14} style={{ color: 'rgba(61, 28, 2, 0.5)' }} />
                            <input
                                type="text"
                                placeholder="Buscar en la plataforma..."
                                className="bg-transparent text-xs outline-none w-full font-semibold placeholder-[#3D1C02]/35"
                                style={{ color: '#3D1C02' }}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                            />
                        </div>

                        {/* Search Results Dropdown */}
                        {isSearchFocused && searchQuery && (
                            <div className="absolute top-11 right-0 w-80 rounded-xl shadow-2xl p-2 z-50"
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid rgba(61, 28, 2, 0.1)',
                                    boxShadow: '0 12px 32px rgba(61, 28, 2, 0.12)',
                                }}
                            >
                                {filteredItems.length > 0 ? (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-wider px-2 py-1 select-none"
                                            style={{ color: 'rgba(61, 28, 2, 0.4)' }}
                                        >Páginas Encontradas</p>
                                        {filteredItems.map(item => (
                                            <button
                                                key={item.href}
                                                onClick={() => {
                                                    router.push(item.href);
                                                    setSearchQuery('');
                                                }}
                                                className="flex items-center justify-between w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                                style={{ color: '#3D1C02' }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(237, 166, 10, 0.12)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <span className="font-bold" style={{ color: '#3D1C02' }}>{item.name}</span>
                                                <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase"
                                                    style={{ background: 'rgba(61, 28, 2, 0.08)', color: '#7A4520' }}
                                                >{item.category}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-4 text-xs font-medium select-none"
                                        style={{ color: 'rgba(61, 28, 2, 0.4)' }}
                                    >No se encontraron resultados</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Notification Bell */}
                    <button
                        className="p-2 rounded-xl border transition-all relative cursor-pointer"
                        style={{
                            background: 'rgba(61, 28, 2, 0.07)',
                            border: '1px solid rgba(61, 28, 2, 0.18)',
                            color: 'rgba(61, 28, 2, 0.6)'
                        }}
                    >
                        <Bell size={16} />
                        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ background: '#D6402C' }}
                        />
                    </button>

                    <div className="w-px h-5" style={{ background: 'rgba(61, 28, 2, 0.15)' }} />

                    {/* User Avatar */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shadow"
                            style={{ background: 'linear-gradient(135deg, #EDA60A, #C8860D)', color: '#ffffff' }}
                        >
                            A
                        </div>
                        <div className="hidden sm:flex flex-col text-left mr-1">
                            <span className="text-xs font-bold" style={{ color: '#3D1C02' }}>Admin</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(61, 28, 2, 0.55)' }}>
                                Administrador
                            </span>
                        </div>
                    </div>

                    <div className="w-px h-5 hidden sm:block" style={{ background: 'rgba(61, 28, 2, 0.15)' }} />

                    {/* Logout */}
                    <button
                        onClick={() => { window.location.href = '/login'; }}
                        className="flex items-center gap-2 p-2 px-3 text-xs font-bold uppercase tracking-wider rounded-xl border transition-all cursor-pointer"
                        style={{
                            background: 'rgba(61, 28, 2, 0.06)',
                            border: '1px solid rgba(61, 28, 2, 0.15)',
                            color: 'rgba(61, 28, 2, 0.6)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(204, 34, 34, 0.15)';
                            e.currentTarget.style.borderColor = 'rgba(204, 34, 34, 0.3)';
                            e.currentTarget.style.color = '#D6402C';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(61, 28, 2, 0.06)';
                            e.currentTarget.style.borderColor = 'rgba(61, 28, 2, 0.15)';
                            e.currentTarget.style.color = 'rgba(61, 28, 2, 0.6)';
                        }}
                        title="Cerrar Sesión"
                    >
                        <LogOut size={14} />
                        <span className="hidden sm:inline">Cerrar Sesión</span>
                    </button>
                </div>
            </header>

            {/* ====== SIDEBAR + CONTENT ====== */}
            <div className="flex flex-1 pt-16 min-h-screen">
                <Sidebar
                    isCollapsed={isCollapsed}
                    setIsCollapsed={setIsCollapsed}
                    isMobileOpen={isMobileOpen}
                    setIsMobileOpen={setIsMobileOpen}
                />

                <div className={cn(
                    "flex-1 flex flex-col min-h-[calc(100vh-4rem)] transition-all duration-300",
                    isCollapsed ? "lg:ml-20" : "lg:ml-64"
                )}>
                    <main className="flex-1 p-4 lg:p-8 relative z-10">
                        <div className="max-w-7xl mx-auto">
                            {children}
                        </div>
                    </main>
                </div>
            </div>

            {/* Floating AI assistant — shared conversation with /dashboard/agente */}
            <AgentWidget />
        </div>
        </AgentProvider>
    );
}
