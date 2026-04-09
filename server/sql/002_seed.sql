BEGIN;

INSERT INTO menus (id, name, description, price, image_url, stock_quantity)
VALUES
  ('americano-ice', '아메리카노(ICE)', '시원하고 깔끔한 맛의 기본 커피', 4000, '/americano-ice.png', 12),
  ('americano-hot', '아메리카노(HOT)', '진한 향이 느껴지는 따뜻한 커피', 4000, '/americano-hot.jpg', 3),
  ('cafe-latte', '카페라떼', '부드러운 우유와 에스프레소의 조화', 5000, '/cafe-latte.jpg', 0),
  ('vanilla-latte', '바닐라라떼', '은은한 바닐라 풍미가 더해진 라떼', 5500, '/vanilla-latte.jpg', 8)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  image_url = EXCLUDED.image_url,
  stock_quantity = EXCLUDED.stock_quantity,
  updated_at = NOW();

INSERT INTO options (id, menu_id, name, extra_price)
VALUES
  ('americano-ice-shot', 'americano-ice', '샷 추가', 500),
  ('americano-ice-syrup', 'americano-ice', '시럽 추가', 0),
  ('americano-hot-shot', 'americano-hot', '샷 추가', 500),
  ('americano-hot-syrup', 'americano-hot', '시럽 추가', 0),
  ('cafe-latte-shot', 'cafe-latte', '샷 추가', 500),
  ('cafe-latte-syrup', 'cafe-latte', '시럽 추가', 0),
  ('vanilla-latte-shot', 'vanilla-latte', '샷 추가', 500),
  ('vanilla-latte-syrup', 'vanilla-latte', '시럽 추가', 0)
ON CONFLICT (id) DO UPDATE
SET
  menu_id = EXCLUDED.menu_id,
  name = EXCLUDED.name,
  extra_price = EXCLUDED.extra_price,
  updated_at = NOW();

COMMIT;

