INSERT OR IGNORE INTO services (id, name, description, price, duration_minutes, sort_order) VALUES
 ('potong-rambut', 'Potong Rambut', 'Potong rambut sesuai gaya yang kamu inginkan, dengan penataan akhir.', 25000, 30, 1),
 ('potong-keramas', 'Potong + Keramas', 'Potong rambut, keramas, dan penataan akhir.', 35000, 30, 2);
INSERT OR IGNORE INTO barbers (id, name, photo_url, description, sort_order) VALUES
 ('capster-a', 'Tio', '', '', 1),
 ('capster-b', 'Angger', '', '', 2),
 ('capster-c', 'Yudha', '', '', 3);
INSERT OR IGNORE INTO shifts (id, name, start_time, end_time) VALUES
 ('shift-a', 'Shift A', 480, 960),
 ('shift-b', 'Shift B', 540, 1080),
 ('shift-c', 'Shift C', 750, 1200);
INSERT OR IGNORE INTO business_settings (key, value) VALUES
 ('rotation', '{"anchor":"2026-01-05","length":3,"rules":[{"barber_id":"capster-a","week":0,"shift_id":"shift-a","off_weekday":0},{"barber_id":"capster-b","week":0,"shift_id":"shift-b","off_weekday":2},{"barber_id":"capster-c","week":0,"shift_id":"shift-c","off_weekday":4},{"barber_id":"capster-a","week":1,"shift_id":"shift-b","off_weekday":1},{"barber_id":"capster-b","week":1,"shift_id":"shift-c","off_weekday":3},{"barber_id":"capster-c","week":1,"shift_id":"shift-a","off_weekday":5},{"barber_id":"capster-a","week":2,"shift_id":"shift-c","off_weekday":2},{"barber_id":"capster-b","week":2,"shift_id":"shift-a","off_weekday":4},{"barber_id":"capster-c","week":2,"shift_id":"shift-b","off_weekday":6}]}');
UPDATE state_version SET revision = revision + 1 WHERE id = 1;
