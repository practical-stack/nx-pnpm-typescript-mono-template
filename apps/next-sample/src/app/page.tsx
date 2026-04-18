import { greet } from '@repo/sample'

export default function Page() {
  return (
    <main
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700 }}>next-sample</h1>
        <p style={{ marginTop: '1rem', color: '#4b5563' }}>{greet('Next.js')}</p>
      </div>
    </main>
  )
}
