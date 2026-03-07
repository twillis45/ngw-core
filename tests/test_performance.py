def test_engine_under_10ms():
    start = time.time()

    recommend(payload)

    assert (time.time() - start) < 0.01
