import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const MENU_LIST = [
  {
    id: 'americano-ice',
    name: '아메리카노(ICE)',
    price: 4000,
    description: '시원하고 깔끔한 맛의 기본 커피',
    imageAlt: '얼음이 들어간 아이스 아메리카노 한 잔',
    image: '/menu/americano-ice.jpg',
  },
  {
    id: 'americano-hot',
    name: '아메리카노(HOT)',
    price: 4000,
    description: '진한 향이 느껴지는 따뜻한 커피',
    imageAlt: '따뜻한 흑커피(아메리카노) 한 잔',
    image: '/menu/americano-hot.jpg',
  },
  {
    id: 'cafe-latte',
    name: '카페라떼',
    price: 5000,
    description: '부드러운 우유와 에스프레소의 조화',
    imageAlt: '라떼 아트가 올라간 카페라떼 한 잔',
    image: '/menu/cafe-latte.jpg',
  },
  {
    id: 'vanilla-latte',
    name: '바닐라라떼',
    price: 5500,
    description: '은은한 바닐라 풍미가 더해진 라떼',
    imageAlt: '우유 거품이 올라간 바닐라 라떼 한 잔',
    image: '/menu/vanilla-latte.jpg',
  },
]

/** 관리자 재고 화면에 표시할 메뉴 (PRD 예시 3종) */
const ADMIN_STOCK_MENU_IDS = ['americano-ice', 'americano-hot', 'cafe-latte']

const OPTION_LIST = [
  { id: 'shot', label: '샷 추가 (+500원)', price: 500 },
  { id: 'syrup', label: '시럽 추가 (+0원)', price: 0 },
]

const ORDER_STATUS = {
  RECEIVED: 'RECEIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
}

const ORDER_STATUS_LABEL = {
  [ORDER_STATUS.RECEIVED]: '주문 접수',
  [ORDER_STATUS.IN_PROGRESS]: '제조 중',
  [ORDER_STATUS.COMPLETED]: '제조 완료',
}

const formatPrice = (price) => `${price.toLocaleString('ko-KR')}원`

const formatOrderDateTime = (timestamp) =>
  new Date(timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const buildOrderSummary = (lines) =>
  lines
    .map((line) => {
      const opts = line.optionLabels.length > 0 ? ` (${line.optionLabels.join(', ')})` : ''
      return `${line.menuName}${opts} x${line.quantity}`
    })
    .join(', ')

const getStockBadge = (count) => {
  if (count === 0) return { label: '품절', className: 'stock-badge stock-badge--out' }
  if (count < 5) return { label: '주의', className: 'stock-badge stock-badge--warn' }
  return { label: '정상', className: 'stock-badge stock-badge--ok' }
}

/** cartKey 앞부분(menuId) 기준으로 메뉴별 수량 합산 */
const getCartQtyByMenu = (cartItems) => {
  const map = {}
  for (const item of cartItems) {
    const menuId = item.menuId ?? item.cartKey.split(':')[0]
    map[menuId] = (map[menuId] ?? 0) + item.quantity
  }
  return map
}

/**
 * 재고 객체에 포함된 메뉴만 검사.
 * 장바구니 해당 메뉴 합계가 재고보다 크면 부족으로 간주.
 */
const findStockShortfalls = (cartItems, stockMap) => {
  const byMenu = getCartQtyByMenu(cartItems)
  const shortfalls = []
  for (const [menuId, qty] of Object.entries(byMenu)) {
    if (!Object.prototype.hasOwnProperty.call(stockMap, menuId)) continue
    const available = stockMap[menuId] ?? 0
    if (qty > available) {
      const menu = MENU_LIST.find((m) => m.id === menuId)
      shortfalls.push({
        menuName: menu?.name ?? menuId,
        orderQty: qty,
        available,
      })
    }
  }
  return shortfalls
}

const formatStockShortfallNotice = (shortfalls) => {
  const detail = shortfalls
    .map((s) => `${s.menuName}: 주문 ${s.orderQty}개, 재고 ${s.available}개`)
    .join(' / ')
  return `재고가 부족해 주문할 수 없습니다. (${detail})`
}

/** 해당 줄 수량을 1 늘릴 때, 메뉴 합계가 재고 상한을 넘지 않는지 */
const canIncreaseCartLine = (item, cartItems, stockMap) => {
  const menuId = item.menuId ?? item.cartKey.split(':')[0]
  if (!Object.prototype.hasOwnProperty.call(stockMap, menuId)) return true
  const byMenu = getCartQtyByMenu(cartItems)
  const total = byMenu[menuId] ?? 0
  const cap = stockMap[menuId] ?? 0
  return total < cap
}

function App() {
  const [view, setView] = useState('order')
  const [selectedOptions, setSelectedOptions] = useState({})
  const [cartItems, setCartItems] = useState([])
  const [isOrdering, setIsOrdering] = useState(false)
  const [notice, setNotice] = useState('')
  const [orders, setOrders] = useState([])

  const [stock, setStock] = useState({
    'americano-ice': 12,
    'americano-hot': 3,
    'cafe-latte': 0,
  })

  const stockMenus = useMemo(
    () => ADMIN_STOCK_MENU_IDS.map((id) => MENU_LIST.find((m) => m.id === id)).filter(Boolean),
    [],
  )

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [cartItems],
  )

  const stockShortfalls = useMemo(
    () => findStockShortfalls(cartItems, stock),
    [cartItems, stock],
  )

  const dashboardCounts = useMemo(() => {
    const total = orders.length
    const received = orders.filter((o) => o.status === ORDER_STATUS.RECEIVED).length
    const inProgress = orders.filter((o) => o.status === ORDER_STATUS.IN_PROGRESS).length
    const completed = orders.filter((o) => o.status === ORDER_STATUS.COMPLETED).length
    return { total, received, inProgress, completed }
  }, [orders])

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt),
    [orders],
  )

  useEffect(() => {
    document.title = 'COZY-커피 주문 앱'
  }, [])

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
    const chosenOptions = OPTION_LIST.filter((option) => optionIds.includes(option.id))
    const optionPrice = chosenOptions.reduce((sum, option) => sum + option.price, 0)
    const unitPrice = menu.price + optionPrice
    const optionKey = optionIds.join('|')
    const cartKey = `${menu.id}:${optionKey}`
    const optionLabels = chosenOptions.map((option) => option.label.split(' (')[0])

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

  const registerOrder = useCallback((items, orderTotal) => {
    const lines = items.map((item) => ({
      menuName: item.menuName,
      optionLabels: item.optionLabels,
      quantity: item.quantity,
      lineTotal: item.totalPrice,
    }))
    const summary = buildOrderSummary(lines)
    const newOrder = {
      id: globalThis.crypto?.randomUUID?.() ?? `ord-${Date.now()}`,
      createdAt: Date.now(),
      lines,
      summary,
      totalPrice: orderTotal,
      status: ORDER_STATUS.RECEIVED,
    }
    setOrders((prev) => [newOrder, ...prev])
  }, [])

  const handleOrder = async () => {
    if (cartItems.length === 0 || isOrdering) {
      return
    }

    const shortfalls = findStockShortfalls(cartItems, stock)
    if (shortfalls.length > 0) {
      setNotice(formatStockShortfallNotice(shortfalls))
      return
    }

    setIsOrdering(true)
    setNotice('')

    try {
      await new Promise((resolve) => {
        setTimeout(resolve, 700)
      })
      const snapshot = [...cartItems]
      const total = snapshot.reduce((s, i) => s + i.totalPrice, 0)
      registerOrder(snapshot, total)
      setCartItems([])
      setNotice('주문이 완료되었습니다.')
    } catch {
      setNotice('주문 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsOrdering(false)
    }
  }

  const adjustStock = (menuId, delta) => {
    setStock((prev) => {
      const current = prev[menuId] ?? 0
      const next = current + delta
      if (next < 0) {
        return prev
      }
      return { ...prev, [menuId]: next }
    })
  }

  const advanceOrder = (orderId) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        if (o.status === ORDER_STATUS.RECEIVED) {
          return { ...o, status: ORDER_STATUS.IN_PROGRESS }
        }
        if (o.status === ORDER_STATUS.IN_PROGRESS) {
          return { ...o, status: ORDER_STATUS.COMPLETED }
        }
        return o
      }),
    )
  }

  const getNextAction = (status) => {
    if (status === ORDER_STATUS.RECEIVED) return { label: '제조 시작' }
    if (status === ORDER_STATUS.IN_PROGRESS) return { label: '제조 완료' }
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

      {view === 'order' ? (
        <div className="order-page">
          <main className="menu-grid" aria-label="커피 메뉴 목록">
            {MENU_LIST.map((menu) => {
              const checkedOptionIds = selectedOptions[menu.id] ?? []

              return (
                <article className="menu-card" key={menu.id}>
                  <img src={menu.image} alt={menu.imageAlt} className="menu-image" />
                  <h2 className="menu-name">{menu.name}</h2>
                  <p className="menu-price">{formatPrice(menu.price)}</p>
                  <p className="menu-description">{menu.description}</p>

                  <fieldset className="option-group">
                    <legend className="sr-only">{menu.name} 옵션 선택</legend>
                    {OPTION_LIST.map((option) => (
                      <label key={option.id} className="option-item">
                        <input
                          type="checkbox"
                          checked={checkedOptionIds.includes(option.id)}
                          onChange={() => toggleOption(menu.id, option.id)}
                        />
                        <span>{option.label}</span>
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
                    const canInc = canIncreaseCartLine(item, cartItems, stock)
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
                                onClick={() => advanceOrder(order.id)}
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
