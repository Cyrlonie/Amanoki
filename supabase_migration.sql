-- ==============================================================================
-- Скрипт миграции Supabase для перехода на многосерверную (Multi-Server) архитектуру
-- Инструкция: Скопируйте этот код и выполните его в SQL Editor вашей панели Supabase.
-- ==============================================================================

-- 1. Создание таблицы серверов (servers)
CREATE TABLE IF NOT EXISTS public.servers (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    icon_url TEXT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Включаем RLS для servers
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- 2. Создание таблицы участников серверов (server_members)
CREATE TABLE IF NOT EXISTS public.server_members (
    server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (server_id, user_id)
);

-- Включаем RLS для server_members
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

-- 3. Миграция: Добавление колонки server_id в таблицу channels
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;

-- 4. Временный фикс для старых данных: Создание дефолтного сервера
DO $$ 
DECLARE
    default_server_id UUID;
    first_admin_id UUID;
BEGIN
    -- Пытаемся найти админа (если есть) или первого попавшегося пользователя для назначения владельцем
    SELECT id INTO first_admin_id FROM public.profiles WHERE is_admin = true LIMIT 1;
    IF first_admin_id IS NULL THEN
        SELECT id INTO first_admin_id FROM public.profiles LIMIT 1;
    END IF;

    -- Создаем дефолтный сервер "WhyBaby"
    INSERT INTO public.servers (name, owner_id) 
    VALUES ('WhyBaby', first_admin_id) 
    RETURNING id INTO default_server_id;

    -- Добавляем всех существующих пользователей в этот сервер
    INSERT INTO public.server_members (server_id, user_id, role)
    SELECT default_server_id, id, 'member' FROM public.profiles
    ON CONFLICT DO NOTHING;

    -- Если нашли админа, делаем его owner-ом в members
    IF first_admin_id IS NOT NULL THEN
        UPDATE public.server_members SET role = 'owner' WHERE server_id = default_server_id AND user_id = first_admin_id;
    END IF;

    -- Привязываем все существующие каналы к этому серверу
    UPDATE public.channels SET server_id = default_server_id WHERE server_id IS NULL;

END $$;

-- Теперь мы можем сделать server_id обязательным (NOT NULL), так как все каналы привязаны
ALTER TABLE public.channels ALTER COLUMN server_id SET NOT NULL;

-- 5. Обновление политик RLS (Row Level Security)

-- Сервера: Все пользователи могут видеть сервера, в которых они состоят
CREATE POLICY "Users can view servers they are members of" ON public.servers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm 
            WHERE sm.server_id = public.servers.id AND sm.user_id = auth.uid()
        )
    );

-- Сервера: Создавать могут все авторизованные пользователи
CREATE POLICY "Users can create servers" ON public.servers
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Участники серверов: Пользователи могут видеть участников серверов, где они состоят
CREATE POLICY "Users can view members of their servers" ON public.server_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm 
            WHERE sm.server_id = public.server_members.server_id AND sm.user_id = auth.uid()
        )
    );

-- Участники серверов: Админы и владельцы могут добавлять/удалять (упрощенно)
CREATE POLICY "Owners and admins can manage members" ON public.server_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm 
            WHERE sm.server_id = public.server_members.server_id 
              AND sm.user_id = auth.uid() 
              AND sm.role IN ('owner', 'admin')
        )
    );

-- Вы можете сами вступать в сервер (если есть инвайт) - для простоты пока разрешаем insert
CREATE POLICY "Users can join servers" ON public.server_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Каналы: Чтение разрешено только участникам сервера
DROP POLICY IF EXISTS "Enable read access for all users" ON public.channels;
CREATE POLICY "Members can view channels" ON public.channels
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.server_members sm 
            WHERE sm.server_id = public.channels.server_id AND sm.user_id = auth.uid()
        )
    );

-- Сообщения: Чтение сообщений разрешено только участникам сервера, которому принадлежит канал
DROP POLICY IF EXISTS "Enable read access for all users" ON public.messages;
CREATE POLICY "Members can view messages" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.server_members sm ON c.server_id = sm.server_id
            WHERE c.slug = public.messages.channel AND sm.user_id = auth.uid()
        )
    );
