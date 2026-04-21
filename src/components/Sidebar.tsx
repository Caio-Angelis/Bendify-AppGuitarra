import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Music2,
  AudioLines,
  SlidersHorizontal,
  ShoppingBag,
  Radio,
  Grid3x3,
  Trophy,
  Medal,
  Users,
  LineChart,
  Mail,
  Gamepad2,
  Headphones,
  Crosshair,
  ChevronDown,
  Brain,
  Mic,
  Star,
  Coins,
  Zap,
  Shield,
  ShieldCheck,
  Guitar,
} from 'lucide-react'
import { STREAK_SHIELD_ITEM_ID } from '../data/shopItems'
import { useStore } from '../store/useStore'
import VisualPlayer from './VisualPlayer'

const navItems = [
  { to: '/dashboard', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/practice', end: false, label: 'Prática', icon: Music2 },
  { to: '/virtual-band', end: false, label: 'Banda Virtual', icon: AudioLines },
  { to: '/tools', end: false, label: 'Ferramentas', icon: SlidersHorizontal },
  { to: '/shop', end: false, label: 'Loja', icon: ShoppingBag },
  { to: '/achievements', end: false, label: 'Conquistas', icon: Trophy },
  { to: '/tones', end: false, label: 'Timbres', icon: Radio },
  { to: '/scales', end: false, label: 'Escalas', icon: Grid3x3 },
  { to: '/ranking', end: false, label: 'Ranking', icon: Medal },
  { to: '/friends', end: false, label: 'Amigos', icon: Users },
  { to: '/teams', end: false, label: 'Bandas', icon: Shield },
  { to: '/log', end: false, label: 'Diário', icon: LineChart },
  { to: '/contact', end: false, label: 'Contato', icon: Mail },
] as const

const challengeLinks = [
  {
    to: '/challenges/ear-training',
    label: 'Desafio de Ouvido',
    icon: Headphones,
  },
  {
    to: '/challenges/fretboard',
    label: 'Ninja do Braço',
    icon: Crosshair,
  },
  {
    to: '/challenges/genius',
    label: 'Genius de Escalas',
    icon: Brain,
  },
  {
    to: '/challenges/pitch-strike',
    label: 'Desafio de Precisão',
    icon: Mic,
  },
  {
    to: '/challenges/scale-runner',
    label: 'Corrida de Escalas',
    icon: Zap,
  },
  {
    to: '/challenges/guitar-hero',
    label: 'Guitar Hero Inteligente',
    icon: Guitar,
  },
] as const

export default function Sidebar() {
  const location = useLocation()
  const profileLevel = useStore((s) => s.userStats.level)
  const credits = useStore((s) => s.userStats.credits)
  const inventory = useStore((s) => s.inventory)
  const shieldQty =
    inventory.find((i) => i.item_id === STREAK_SHIELD_ITEM_ID)?.quantity ?? 0
  const [challengesOpen, setChallengesOpen] = useState(() =>
    location.pathname.startsWith('/challenges'),
  )

  useEffect(() => {
    if (location.pathname.startsWith('/challenges')) {
      setChallengesOpen(true)
    }
  }, [location.pathname])

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/5 bg-[#1A1A1A]/80 py-6 backdrop-blur-sm md:w-60">
      <div className="mb-5 px-3">
        <Link
          to="/dashboard"
          className="block text-lg font-bold tracking-tight text-[#F5F5F5] transition hover:opacity-90"
          aria-label="Bendify — início"
        >
          <span className="text-[#FFB300]">B</span>endify
        </Link>
      </div>
      <div
        className="mx-3 mb-4 flex flex-col gap-2 rounded-xl border border-[#333333] bg-[#121212]/90 px-3 py-3 shadow-[0_0_24px_rgba(255,179,0,0.12)]"
        aria-label="Nível e créditos"
      >
        <div className="flex items-center gap-2.5 text-sm font-semibold text-[#FFB300]">
          <Star className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            Nível <span className="tabular-nums">{profileLevel}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-[#FFB300]">
          <div className="flex items-center gap-2.5">
            <Coins className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span>
              <span className="tabular-nums">{credits}</span> créditos
            </span>
          </div>
          {shieldQty > 0 ? (
            <div
              className="flex items-center gap-1.5 text-[#F5F5F5]/90"
              title="Escudos de Ofensiva"
            >
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-[#FFB300]"
                strokeWidth={2}
                aria-hidden
              />
              <span className="text-xs font-semibold tabular-nums">
                ×{shieldQty}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mx-3 mb-4">
        <VisualPlayer compact />
      </div>
      <nav className="flex flex-col gap-1 px-3" aria-label="Principal">
        {navItems.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out',
                isActive
                  ? 'bg-[#FFB300]/10 text-[#FFB300] border-r-2 border-[#FFB300]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5',
              ].join(' ')
            }
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setChallengesOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white"
            aria-expanded={challengesOpen}
          >
            <Gamepad2 className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="flex-1">Desafios</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${challengesOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {challengesOpen && (
            <div className="mt-0.5 flex flex-col gap-0.5 border-l border-[#333333] pl-2 ml-3">
              {challengeLinks.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2.5 rounded-lg py-2 pl-2 pr-2 text-sm font-medium transition-all duration-200 ease-in-out',
                      isActive
                        ? 'bg-[#FFB300]/10 text-[#FFB300] border-r-2 border-[#FFB300]'
                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                    ].join(' ')
                  }
                >
                  <Icon
                    className="h-4 w-4 shrink-0 opacity-90"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>
    </aside>
  )
}
