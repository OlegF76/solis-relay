-- Текущие данные инвертора (одна строка, ESP перезаписывает)
CREATE TABLE current_data (
    id int PRIMARY KEY DEFAULT 1,
    data jsonb NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Первая строка
INSERT INTO current_data (id, data) VALUES (1, '{}');

-- История (одна запись в минуту)
CREATE TABLE history (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    pv_power int NOT NULL DEFAULT 0,
    bat_power int NOT NULL DEFAULT 0,
    bat_soc int NOT NULL DEFAULT 0,
    grid_power int NOT NULL DEFAULT 0,
    load_power int NOT NULL DEFAULT 0
);

-- Индекс по времени для быстрых запросов
CREATE INDEX idx_history_ts ON history (ts DESC);

-- Автоудаление записей старше 7 дней (через pg_cron если доступен, или вручную)
-- Пока не нужно, бесплатный план = 500MB хватит надолго

-- Отключить RLS для простоты (данные не секретные)
ALTER TABLE current_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

-- Разрешить anon ключу читать и писать
CREATE POLICY "Allow all for current_data" ON current_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for history" ON history FOR ALL USING (true) WITH CHECK (true);
