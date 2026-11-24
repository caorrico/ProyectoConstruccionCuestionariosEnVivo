BEGIN;
DO $$
DECLARE g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); r1 uuid := gen_random_uuid(); fixture_pin text := lpad(floor(random()*1000000)::text, 6, '0');
BEGIN
  INSERT INTO games(id,owner_id,quiz_id,version_id,snapshot,pin,state) VALUES (g1,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'{}',fixture_pin,'WAITING');
  BEGIN
    INSERT INTO games(id,owner_id,quiz_id,version_id,snapshot,pin,state) VALUES (g2,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'{}',fixture_pin,'WAITING');
    RAISE EXCEPTION 'se aceptó un PIN activo duplicado';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO games(id,owner_id,quiz_id,version_id,snapshot,pin,state) VALUES (g2,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'{}',NULL,'FINISHED');
  BEGIN UPDATE games SET pin=fixture_pin WHERE id=g2; RAISE EXCEPTION 'se aceptó PIN en partida finalizada'; EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO participants(id,game_id,nickname) VALUES(p1,g1,'Alumna'),(p2,g2,'Otro');
  BEGIN INSERT INTO participants(id,game_id,nickname) VALUES(gen_random_uuid(),g1,'alumna'); RAISE EXCEPTION 'se aceptó apodo duplicado'; EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO rounds(id,game_id,question_id,question_order,opens_at,closes_at) VALUES(r1,g1,gen_random_uuid(),1,now(),now()+interval '30 seconds');
  BEGIN INSERT INTO answers(id,game_id,round_id,participant_id,answer) VALUES(gen_random_uuid(),g1,r1,p2,'{}'); RAISE EXCEPTION 'se aceptó participante de otra partida'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO answers(id,game_id,round_id,participant_id,answer) VALUES(gen_random_uuid(),g1,r1,p1,'{}');
  BEGIN INSERT INTO answers(id,game_id,round_id,participant_id,answer) VALUES(gen_random_uuid(),g1,r1,p1,'{}'); RAISE EXCEPTION 'se aceptó respuesta duplicada'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
ROLLBACK;
