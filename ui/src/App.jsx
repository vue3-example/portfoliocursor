import { useEffect, useMemo, useState } from 'react'
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

const OPTION_LIST = [
  { id: 'shot', label: '샷 추가 (+500원)', price: 500 },
  { id: 'syrup', label: '시럽 추가 (+0원)', price: 0 },
]

const formatPrice = (price) => `${price.toLocaleString('ko-KR')}원`

function App() {
  const [selectedOptions, setSelectedOptions] = useState({})
  const [cartItems, setCartItems] = useState([])
  const [isOrdering, setIsOrdering] = useState(false)
  const [notice, setNotice] = useState('')

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [cartItems],
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

  const handleOrder = async () => {
    if (cartItems.length === 0 || isOrdering) {
      return
    }

    setIsOrdering(true)
    setNotice('')

    try {
      await new Promise((resolve) => {
        setTimeout(resolve, 700)
      })
      setCartItems([])
      setNotice('주문이 완료되었습니다.')
    } catch {
      setNotice('주문 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsOrdering(false)
    }
  }

  return (
    <div className="order-page">
      <header className="top-nav">
        <h1 className="brand">COZY-커피 주문 앱</h1>
        <nav className="tabs" aria-label="주요 화면">
          <button type="button" className="tab active">
            주문하기
          </button>
          <button type="button" className="tab">
            관리자
          </button>
        </nav>
      </header>

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
              {cartItems.map((item) => (
                <li key={item.cartKey} className="cart-item">
                  <p className="item-name">
                    {item.menuName}
                    {item.optionLabels.length > 0 ? ` (${item.optionLabels.join(', ')})` : ''}
                  </p>
                  <p className="item-qty">x {item.quantity}</p>
                  <p className="item-price">{formatPrice(item.totalPrice)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cart-right">
          <p className="total-label">총 금액</p>
          <p className="total-price">{formatPrice(totalPrice)}</p>
          <button
            type="button"
            className="primary-button order-button"
            disabled={cartItems.length === 0 || isOrdering}
            onClick={handleOrder}
          >
            {isOrdering ? '주문 처리 중...' : '주문하기'}
          </button>
        </div>
      </section>

      {notice ? <p className="notice">{notice}</p> : null}
    </div>
  )
}

export default App
