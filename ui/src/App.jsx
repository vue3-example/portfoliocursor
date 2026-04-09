import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4000'
const ORDER_STATUS = { RECEIVED: 'RECEIVED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' }
const ORDER_STATUS_LABEL = {
  RECEIVED: '주문 접수',
  IN_PROGRESS: '제조 중',
  COMPLETED: '제조 완료',
}

const formatPrice = (price) => `${Number(price || 0).toLocaleString('ko-KR')}원`
const formatOrderDateTime = (timestamp) =>
  new Date(timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const getStockBadge = (count) => {
  if (count === 0) return { label: '품절', className: 'stock-badge stock-badge--out' }
  if (count < 5) return { label: '주의', className: 'stock-badge stock-badge--warn' }
  return { label: '정상', className: 'stock-badge stock-badge--ok' }
}

const getCartQtyByMenu = (cartItems) => {
  const map = {}
  for (const item of cartItems) map[item.menuId] = (map[item.menuId] ?? 0) + item.quantity
  return map
}

const formatStockShortfallNotice = (shortfalls) =>
  `재고가 부족해 주문할 수 없습니다. (${shortfalls
    .map((s) => `${s.menuName}: 주문 ${s.orderQty}개, 재고 ${s.available}개`)
    .join(' / ')})`

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || '요청에 실패했습니다.')
  return data
}

function App() {
  const [view, setView] = useState('order')
  const [menus, setMenus] = useState([])
  const [selectedOptions, setSelectedOptions] = useState({})
  const [cartItems, setCartItems] = useState([])
  const [orders, setOrders] = useState([])
  const [notice, setNotice] = useState('')
  const [isOrdering, setIsOrdering] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    document.title = 'COZY-커피 주문 앱'
  }, [])

  const loadMenus = useCallback(async () => {
    const data = await fetchJson('/api/menus')
    setMenus(data.menus ?? [])
  }, [])

  const loadOrders = useCallback(async () => {
    const data = await fetchJson('/api/orders')
    setOrders(
      (data.orders ?? []).map((order) => ({
        id: order.id,
        summary: order.summary,
        totalPrice: order.totalPrice,
        status: order.status,
        createdAt: order.orderedAt,
      })),
    )
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        await Promise.all([loadMenus(), loadOrders()])
      } catch {
        setNotice('데이터를 불러오지 못했습니다. 다시 시도해 주세요.')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [loadMenus, loadOrders])

  const stock = useMemo(() => {
    const map = {}
    for (const m of menus) map[m.id] = m.stockQuantity
    return map
  }, [menus])

  const stockMenus = useMemo(
    () => menus.filter((m) => ['americano-ice', 'americano-hot', 'cafe-latte'].includes(m.id)),
    [menus],
  )

  const stockShortfalls = useMemo(() => {
    const byMenu = getCartQtyByMenu(cartItems)
    return Object.entries(byMenu)
      .filter(([menuId, qty]) => typeof stock[menuId] === 'number' && qty > stock[menuId])
      .map(([menuId, qty]) => ({
        menuName: menus.find((m) => m.id === menuId)?.name ?? menuId,
        orderQty: qty,
        available: stock[menuId] ?? 0,
      }))
  }, [cartItems, stock, menus])

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [cartItems],
  )

  const dashboardCounts = useMemo(() => {
    const total = orders.length
    const received = orders.filter((o) => o.status === ORDER_STATUS.RECEIVED).length
    const inProgress = orders.filter((o) => o.status === ORDER_STATUS.IN_PROGRESS).length
    const completed = orders.filter((o) => o.status === ORDER_STATUS.COMPLETED).length
    return { total, received, inProgress, completed }
  }, [orders])

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [orders],
  )

  const toggleOption = (menuId, optionId) => {
    setSelectedOptions((prev) => {
      const optionSet = new Set(prev[menuId] ?? [])
      if (optionSet.has(optionId)) {
        optionSet.delete(optionId)
      } else {
        optionSet.add(optionId)
      }
      return {
        ...prev,
        [menuId]: Array.from(optionSet),
      }
    })
  }

  const addToCart = (menu) => {
    const optionIds = (selectedOptions[menu.id] ?? []).sort()
    const chosenOptions = (menu.options ?? []).filter((option) => optionIds.includes(option.id))
    const optionPrice = chosenOptions.reduce((sum, option) => sum + option.price, 0)
    const unitPrice = menu.price + optionPrice
    const optionKey = optionIds.join('|')
    const cartKey = `${menu.id}:${optionKey}`
    const optionLabels = chosenOptions.map((option) => option.name)

    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.cartKey === cartKey)
      if (existingItem) {
        return prev.map((item) =>
          item.cartKey === cartKey
            ? {
                ...item,
                menuId: menu.id,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice,
              }
            : item,
        )
      }

      return [
        ...prev,
        {
          cartKey,
          menuId: menu.id,
          menuName: menu.name,
          optionIds,
          optionLabels,
          quantity: 1,
          unitPrice,
          totalPrice: unitPrice,
        },
      ]
    })

    setNotice('장바구니에 담겼습니다.')
  }

  const adjustCartQuantity = (cartKey, delta) => {
    setCartItems((prev) => {
      const item = prev.find((i) => i.cartKey === cartKey)
      if (!item) return prev
      if (delta > 0) {
        const menuId = item.menuId ?? cartKey.split(':')[0]
        if (Object.prototype.hasOwnProperty.call(stock, menuId)) {
          const byMenu = getCartQtyByMenu(prev)
          const total = byMenu[menuId] ?? 0
          if (total + delta > (stock[menuId] ?? 0)) {
            return prev
          }
        }
      }
      const nextQty = item.quantity + delta
      if (nextQty <= 0) {
        return prev.filter((i) => i.cartKey !== cartKey)
      }
      return prev.map((i) =>
        i.cartKey === cartKey
          ? {
              ...i,
              quantity: nextQty,
              totalPrice: nextQty * i.unitPrice,
            }
          : i,
      )
    })
  }

  const handleOrder = async () => {
    if (cartItems.length === 0 || isOrdering) {
      return
    }

    if (stockShortfalls.length > 0) {
      setNotice(formatStockShortfallNotice(stockShortfalls))
      return
    }

    setIsOrdering(true)
    setNotice('')

    try {
      await fetchJson('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            menuId: item.menuId,
            quantity: item.quantity,
            optionIds: item.optionIds ?? [],
          })),
        }),
      })
      setCartItems([])
      setNotice('주문이 완료되었습니다.')
      await Promise.all([loadMenus(), loadOrders()])
    } catch {
      setNotice('주문 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsOrdering(false)
    }
  }

  const adjustStock = async (menuId, delta) => {
    try {
      await fetchJson(`/api/menus/${menuId}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ delta }),
      })
      await loadMenus()
    } catch {
      setNotice('재고 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  const advanceOrder = async (orderId, nextStatus) => {
    try {
      await fetchJson(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ nextStatus }),
      })
      await loadOrders()
    } catch {
      setNotice('주문 상태 변경에 실패했습니다. 다시 시도해 주세요.')
    }
  }

  const getNextAction = (status) => {
    if (status === ORDER_STATUS.RECEIVED) return { label: '제조 시작', nextStatus: ORDER_STATUS.IN_PROGRESS }
    if (status === ORDER_STATUS.IN_PROGRESS) return { label: '제조 완료', nextStatus: ORDER_STATUS.COMPLETED }
    return null
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <h1 className="brand">COZY-커피 주문 앱</h1>
        <nav className="tabs" aria-label="주요 화면">
          <button
            type="button"
            className={`tab${view === 'order' ? ' active' : ''}`}
            onClick={() => setView('order')}
          >
            주문하기
          </button>
          <button
            type="button"
            className={`tab${view === 'admin' ? ' active' : ''}`}
            onClick={() => setView('admin')}
          >
            관리자
          </button>
        </nav>
      </header>

      {isLoading ? (
        <p className="notice">불러오는 중...</p>
      ) : view === 'order' ? (
        <div className="order-page">
          <main className="menu-grid" aria-label="커피 메뉴 목록">
            {menus.map((menu) => {
              const checkedOptionIds = selectedOptions[menu.id] ?? []

              return (
                <article className="menu-card" key={menu.id}>
                  <img src={menu.imageUrl} alt={`${menu.name} 이미지`} className="menu-image" />
                  <h2 className="menu-name">{menu.name}</h2>
                  <p className="menu-price">{formatPrice(menu.price)}</p>
                  <p className="menu-description">{menu.description}</p>

                  <fieldset className="option-group">
                    <legend className="sr-only">{menu.name} 옵션 선택</legend>
                    {(menu.options ?? []).map((option) => (
                      <label key={option.id} className="option-item">
                        <input
                          type="checkbox"
                          checked={checkedOptionIds.includes(option.id)}
                          onChange={() => toggleOption(menu.id, option.id)}
                        />
                        <span>
                          {option.name} (+{option.extraPrice}원)
                        </span>
                      </label>
                    ))}
                  </fieldset>

                  <button type="button" className="primary-button add-button" onClick={() => addToCart(menu)}>
                    담기
                  </button>
                </article>
              )
            })}
          </main>

          <section className="cart-panel" aria-label="장바구니">
            <div className="cart-left">
              <h2 className="cart-title">장바구니</h2>
              {cartItems.length === 0 ? (
                <p className="empty-cart">담긴 메뉴가 없습니다.</p>
              ) : (
                <ul className="cart-list">
                  {cartItems.map((item) => {
                    const lineLabel = `${item.menuName}${item.optionLabels.length > 0 ? ` (${item.optionLabels.join(', ')})` : ''}`
                    const menuTotal = getCartQtyByMenu(cartItems)[item.menuId] ?? 0
                    const canInc = typeof stock[item.menuId] !== 'number' ? true : menuTotal < stock[item.menuId]
                    return (
                      <li key={item.cartKey} className="cart-item">
                        <p className="item-name">{lineLabel}</p>
                        <div
                          className="cart-qty-controls"
                          role="group"
                          aria-label={`${lineLabel} 주문 수량`}
                        >
                          <button
                            type="button"
                            className="cart-qty-btn"
                            aria-label={`${lineLabel} 수량 1 줄이기`}
                            onClick={() => adjustCartQuantity(item.cartKey, -1)}
                          >
                            −
                          </button>
                          <span className="cart-qty-value" aria-live="polite">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="cart-qty-btn"
                            aria-label={`${lineLabel} 수량 1 늘리기`}
                            disabled={!canInc}
                            onClick={() => adjustCartQuantity(item.cartKey, 1)}
                          >
                            +
                          </button>
                        </div>
                        <p className="item-price">{formatPrice(item.totalPrice)}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="cart-right">
              <p className="total-label">총 금액</p>
              <p className="total-price">{formatPrice(totalPrice)}</p>
              <button
                type="button"
                className="primary-button order-button"
                disabled={cartItems.length === 0 || isOrdering || stockShortfalls.length > 0}
                onClick={handleOrder}
              >
                {isOrdering ? '주문 처리 중...' : '주문하기'}
              </button>
              {stockShortfalls.length > 0 ? (
                <p className="stock-shortfall-hint">{formatStockShortfallNotice(stockShortfalls)}</p>
              ) : null}
            </div>
          </section>

          {notice ? <p className="notice">{notice}</p> : null}
        </div>
      ) : (
        <div className="admin-page">
          <section className="admin-section" aria-labelledby="admin-dashboard-heading">
            <h2 id="admin-dashboard-heading" className="admin-section-title">
              관리자 대시보드
            </h2>
            <div className="dashboard-grid">
              <article className="dashboard-card">
                <p className="dashboard-label">총 주문 수</p>
                <p className="dashboard-value">{dashboardCounts.total}</p>
              </article>
              <article className="dashboard-card">
                <p className="dashboard-label">주문 접수</p>
                <p className="dashboard-value">{dashboardCounts.received}</p>
              </article>
              <article className="dashboard-card">
                <p className="dashboard-label">제조 중</p>
                <p className="dashboard-value">{dashboardCounts.inProgress}</p>
              </article>
              <article className="dashboard-card">
                <p className="dashboard-label">제조 완료</p>
                <p className="dashboard-value">{dashboardCounts.completed}</p>
              </article>
            </div>
          </section>

          <section className="admin-section" aria-labelledby="stock-heading">
            <h2 id="stock-heading" className="admin-section-title">
              재고 현황
            </h2>
            <div className="stock-grid">
              {stockMenus.map((menu) => {
                const count = stock[menu.id] ?? 0
                const badge = getStockBadge(count)
                return (
                  <article className="stock-card" key={menu.id}>
                    <p className="stock-menu-name">{menu.name}</p>
                    <p className="stock-count">
                      {count.toLocaleString('ko-KR')}개
                    </p>
                    <p className={badge.className}>{badge.label}</p>
                    <div className="stock-buttons">
                      <button
                        type="button"
                        className="stock-btn"
                        aria-label={`${menu.name} 재고 1 감소`}
                        onClick={() => adjustStock(menu.id, -1)}
                        disabled={count <= 0}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="stock-btn"
                        aria-label={`${menu.name} 재고 1 증가`}
                        onClick={() => adjustStock(menu.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="admin-section" aria-labelledby="orders-heading">
            <h2 id="orders-heading" className="admin-section-title">
              주문 현황
            </h2>
            {sortedOrders.length === 0 ? (
              <p className="empty-orders">접수된 주문이 없습니다.</p>
            ) : (
              <div className="order-table-wrap">
                <table className="order-table">
                  <thead>
                    <tr>
                      <th scope="col">주문 일시</th>
                      <th scope="col">주문 메뉴</th>
                      <th scope="col" className="col-amount">
                        금액
                      </th>
                      <th scope="col">상태</th>
                      <th scope="col">처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOrders.map((order) => {
                      const action = getNextAction(order.status)
                      return (
                        <tr key={order.id}>
                          <td className="cell-time">{formatOrderDateTime(order.createdAt)}</td>
                          <td className="cell-menu">{order.summary}</td>
                          <td className="cell-amount">{formatPrice(order.totalPrice)}</td>
                          <td className="cell-status">
                            <span className="status-pill">{ORDER_STATUS_LABEL[order.status]}</span>
                          </td>
                          <td className="cell-action">
                            {action ? (
                              <button
                                type="button"
                                className="primary-button table-action-btn"
                                onClick={() => advanceOrder(order.id, action.nextStatus)}
                              >
                                {action.label}
                              </button>
                            ) : (
                              <span className="action-done">완료</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
