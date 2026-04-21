import { useState, type FormEvent } from 'react'
import { tryUnlockAchievement } from '../hooks/tryUnlockAchievement'
import { useStore } from '../store/useStore'
import { submitFeedback } from '../utils/supabase'

export default function Contact() {
  const session = useStore((s) => s.session)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const userId = session?.user?.id ?? ''
  const userEmail = session?.user?.email ?? ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSuccess(false)

    const trimmed = message.trim()
    if (!trimmed) {
      setSubmitError('Escreva uma mensagem antes de enviar.')
      return
    }
    if (!userId) {
      setSubmitError('Sessão inválida. Recarregue a página ou volte a entrar.')
      return
    }

    setLoading(true)
    try {
      const result = await submitFeedback(userId, userEmail, trimmed)
      if (result.success) {
        setMessage('')
        setSuccess(true)
        void tryUnlockAchievement(userId, 'feedback_sent')
      } else {
        setSubmitError(result.error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl text-[#F5F5F5]">
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-[#F5F5F5] md:text-3xl">
        Contato
      </h1>

      <div className="mt-8 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <p className="text-sm text-[#F5F5F5] sm:text-base">
          Desenvolvido por: Caio Angelis
        </p>
        <p className="text-sm text-[#BDBDBD] sm:text-base">
          Contato: Caioangelis@hotmail.com
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
      >
        <h2 className="font-mono text-lg font-semibold text-[#F5F5F5]">
          Deixe seu feedback ou reporte um erro
        </h2>

        <label htmlFor="feedback-message" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="feedback-message"
          name="message"
          rows={6}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            setSuccess(false)
            setSubmitError(null)
          }}
          disabled={loading}
          placeholder="A sua mensagem…"
          className="w-full resize-y rounded-lg border border-white/10 bg-[#121212]/50 px-4 py-3 text-sm text-[#F5F5F5] placeholder:text-[#F5F5F5]/40 backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:outline-none focus:ring-1 focus:ring-[#FFB300]/30 disabled:opacity-60"
        />

        {submitError ? (
          <p className="text-sm text-[#D32F2F]" role="alert">
            {submitError}
          </p>
        ) : null}
        {success ? (
          <p className="text-sm text-[#81C784]" role="status">
            Mensagem enviada!
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#FFB300] px-5 py-2.5 text-sm font-semibold text-[#1A1A1A] transition duration-200 ease-in-out hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'A enviar…' : 'Enviar'}
        </button>
      </form>
    </div>
  )
}
