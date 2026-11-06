import scenes


def test_example_scenes_match_their_generator(tmp_path):
    for index in range(len(scenes.SCENES)):
        fresh = scenes.write(index, tmp_path)
        assert fresh.read_bytes() == (scenes.OUT / fresh.name).read_bytes(), fresh.name
