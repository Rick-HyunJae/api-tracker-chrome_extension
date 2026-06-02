import React, { useEffect, useRef } from 'react'
import { grantConsent } from '../../shared/storage'

export function ConsentBanner(): React.ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    buttonRef.current?.focus()
  }, [])

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-desc"
      aria-modal="true"
      style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}
    >
      <h2 id="consent-title">API Tracker 데이터 수집 동의</h2>
      <p id="consent-desc">
        이 Extension은 현재 페이지에서 발생하는 모든 API 호출의
        <strong>요청 헤더(인증 토큰 포함)</strong>, 요청/응답 body를
        외부 서버로 전송합니다. 민감한 정보가 포함될 수 있습니다.
      </p>
      <button ref={buttonRef} onClick={() => void grantConsent()}>동의하고 시작</button>
    </div>
  )
}
